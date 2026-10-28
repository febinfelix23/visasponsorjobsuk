/**
 * Sends the run report to Telegram: the last step of every workflow (`if: always()` for the
 * scrape, `if: failure()` for the rest). Always exits 0, so a report can't fail a run.
 *
 *   npm run notify:run -- --workflow Scrape --status success
 *   npm run notify:run -- --workflow Scrape --status success --dry-run   # print, don't send
 */
import "./load-env";

import { parseArgs } from "node:util";
import { and, desc, eq, gte, inArray, max, ne, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { crawlRuns, jobs, jobSources } from "@/lib/db/schema";
import { formatRunReport, type ClassifyReport, type Health, type ReadReport, type ScoreReport, type ScrapeReport } from "@/lib/notify/format";
import { loadReport } from "@/lib/notify/run-report";
import { sendTelegram } from "@/lib/notify/telegram";

const { values: args } = parseArgs({
  options: {
    workflow: { type: "string", default: "Run" },
    status: { type: "string", default: process.env.JOB_STATUS ?? "success" },
    health: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

/** How long each workflow may go without a success before the report says so. */
const EXPECTED_HOURS: Record<string, { label: string; hours: number }> = {
  scrape: { label: "Scrape", hours: 26 },
  register_ingest: { label: "Register ingest", hours: 50 },
  ats_discovery: { label: "Job board discovery", hours: 50 },
  sector_tagging: { label: "Sector tagging", hours: 8 * 24 + 2 },
};

const shortDate = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

async function readHealth(): Promise<Health | null> {
  if (!process.env.DATABASE_URL) return null;
  const db = createDb(undefined, { max: 1 });
  try {
    const [counts] = await db
      .select({
        live: sql<number>`count(*)::int`,
        passing: sql<number>`count(*) filter (where ${inArray(jobs.sponsorability, ["sponsorship_mentioned", "likely_eligible"])})::int`,
      })
      .from(jobs)
      .where(eq(jobs.status, "live"));
    const failingWhere = and(gte(jobSources.consecutiveFailures, 3), ne(jobSources.status, "disabled"));
    const failing = await db
      .select({ ats: jobSources.ats, identifier: jobSources.identifier, error: jobSources.lastError })
      .from(jobSources)
      .where(failingWhere)
      .orderBy(desc(jobSources.consecutiveFailures))
      .limit(5);
    const [{ failingCount }] = await db.select({ failingCount: sql<number>`count(*)::int` }).from(jobSources).where(failingWhere);
    const lastOk = await db
      .select({ kind: crawlRuns.kind, at: max(crawlRuns.finishedAt) })
      .from(crawlRuns)
      .where(inArray(crawlRuns.status, ["succeeded", "skipped"]))
      .groupBy(crawlRuns.kind);
    const lastByKind = new Map(lastOk.map((r) => [r.kind as string, r.at]));
    const stale = Object.entries(EXPECTED_HOURS).flatMap(([kind, { label, hours }]) => {
      const at = lastByKind.get(kind);
      return !at || Date.now() - at.getTime() > hours * 3_600_000 ? [{ kind: label, lastSuccess: at ? shortDate(at) : null }] : [];
    });
    return {
      liveJobs: counts.live,
      passingJobs: counts.passing,
      failingSources: failing.map((f) => ({ label: `${f.ats}/${f.identifier}`, error: f.error })),
      failingCount,
      stale,
    };
  } finally {
    await db.$client.end();
  }
}

async function main() {
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;
  const [scrape, classify, read, score] = await Promise.all([
    loadReport<ScrapeReport>("scrape"),
    loadReport<ClassifyReport>("classify"),
    loadReport<ReadReport>("read"),
    loadReport<ScoreReport>("score"),
  ]);
  // A broken database is itself worth reporting; the message still goes out without the health lines.
  const health = args.health ? await readHealth().catch((error) => (console.warn(`Health check failed: ${error instanceof Error ? error.message : error}`), null)) : null;

  const text = formatRunReport({ workflow: args.workflow, status: args.status, runUrl, scrape, classify, read, score, health });
  if (args["dry-run"]) {
    console.log(text);
    return;
  }
  const result = await sendTelegram(text);
  console.log(
    result === "sent" ? "Run report sent to Telegram." : result === "not_configured" ? "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set: no report sent." : "Run report not sent (see warning above).",
  );
}

main().catch((error) => console.warn(`Run report failed: ${error instanceof Error ? error.message : error}`));
