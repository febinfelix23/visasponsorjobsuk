/**
 * Crawls job sources that are due and stores their UK jobs. Unverified boards are
 * checked against their job text first and promoted or disabled.
 *
 *   npm run scrape                          # every source due now
 *   npm run scrape -- --ats greenhouse      # one ATS only
 *   npm run scrape -- --source 42           # one source, even if not due
 *   npm run scrape -- --limit 20 --dry-run  # fetch and report, write nothing
 */
import "./load-env";

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { startRun } from "@/lib/db/runs";
import { saveReport } from "@/lib/notify/run-report";
import { crawlRuns, jobSources, sponsors } from "@/lib/db/schema";
import { createBoardReviewer } from "@/lib/discovery/ai-review";
import { getBlockedHosts } from "@/lib/http";
import { crawlSource, dueBefore, type CrawlResult, type CrawlTarget } from "@/lib/scrape/pipeline";
import { createNhsMatcher } from "@/lib/sponsors/nhs-match";
import { splitTradingName } from "@/lib/sponsors/normalise";

const SOURCE_CONCURRENCY = 6;
const NHS_IDENTIFIER = "nhs-jobs";

const { values: args } = parseArgs({
  options: {
    limit: { type: "string", default: "1000" },
    ats: { type: "string" },
    source: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

async function main() {
  const db = createDb(undefined, { max: 3 });
  const runId = await startRun(db, "scrape");
  const finish = (status: "succeeded" | "failed", stats: Record<string, unknown>, error?: string) =>
    db.update(crawlRuns).set({ status, stats, error, finishedAt: new Date() }).where(eq(crawlRuns.id, runId));

  try {
    // NHS Jobs is one shared source with no sponsor of its own.
    await db
      .insert(jobSources)
      .values({ ats: "nhs_jobs", identifier: NHS_IDENTIFIER, careersUrl: "https://www.jobs.nhs.uk", status: "active", discovery: { method: "builtin" } })
      .onConflictDoNothing({ target: [jobSources.ats, jobSources.identifier] });

    const rows = await db
      .select({
        id: jobSources.id,
        ats: jobSources.ats,
        identifier: jobSources.identifier,
        careersUrl: jobSources.careersUrl,
        discovery: jobSources.discovery,
        status: jobSources.status,
        sponsorId: jobSources.sponsorId,
        sponsorName: sponsors.name,
        sponsorTradingName: sponsors.tradingName,
        sponsorSector: sponsors.sector,
        sponsorTown: sponsors.town,
        sponsorCounty: sponsors.county,
        sponsorSicCodes: sponsors.sicCodes,
      })
      .from(jobSources)
      .leftJoin(sponsors, eq(sponsors.id, jobSources.sponsorId))
      .where(
        args.source
          ? eq(jobSources.id, Number(args.source))
          : and(
              inArray(jobSources.status, ["active", "unverified", "failing"]),
              lte(jobSources.nextCrawlAt, dueBefore(new Date())),
              args.ats ? eq(jobSources.ats, args.ats as CrawlTarget["ats"]) : undefined,
            ),
      )
      // Confirmed boards first, then the most overdue.
      .orderBy(sql`${jobSources.status} = 'unverified'`, asc(jobSources.nextCrawlAt))
      .limit(Number(args.limit));
    const targets: CrawlTarget[] = rows.map((r) => ({
      ...r,
      sponsorTradingName: r.sponsorTradingName ?? (r.sponsorName ? splitTradingName(r.sponsorName).tradingName : null),
    }));
    console.log(`${targets.length} sources due${args["dry-run"] ? " (dry run)" : ""}`);

    // NHS employers → sponsors. NHS Jobs and the register spell NHS bodies differently.
    let matchSponsor: (employer: string) => number | null = () => null;
    if (targets.some((t) => t.ats === "nhs_jobs")) {
      const all = await db
        .select({ id: sponsors.id, name: sponsors.name })
        .from(sponsors)
        .where(eq(sponsors.status, "active"))
        .orderBy(sql`${sponsors.isSkilledWorker} desc`);
      matchSponsor = createNhsMatcher(all);
    }

    const stats = {
      sources: targets.length,
      stored: 0,
      promoted: 0,
      verificationFailed: 0,
      insufficientEvidence: 0,
      needsReview: 0,
      aiPromoted: 0,
      aiRejected: 0,
      aiReview: "off" as string,
      errors: 0,
      ukJobs: 0,
      inserted: 0,
      expired: 0,
      byAts: {} as Record<string, { sources: number; ukJobs: number; errors: number }>,
      errorSamples: [] as string[],
      blockedHosts: [] as string[],
    };
    const record = (t: CrawlTarget, r: CrawlResult) => {
      const a = (stats.byAts[t.ats] ??= { sources: 0, ukJobs: 0, errors: 0 });
      a.sources++;
      if (r.outcome === "error") {
        stats.errors++;
        a.errors++;
        if (stats.errorSamples.length < 15) stats.errorSamples.push(`${t.ats}/${t.identifier}: ${r.error.slice(0, 160)}`);
        return;
      }
      stats.ukJobs += r.ukJobs;
      a.ukJobs += r.ukJobs;
      if (r.outcome === "stored") {
        stats.stored++;
        stats.inserted += r.inserted;
        stats.expired += r.expired;
        if (r.promoted) stats.promoted++;
        if (r.aiPromoted) stats.aiPromoted++;
      } else if (r.outcome === "verification_failed") stats.verificationFailed++;
      else if (r.outcome === "needs_review") stats.needsReview++;
      else if (r.outcome === "ai_rejected") stats.aiRejected++;
      else stats.insufficientEvidence++;
    };

    // AI check for boards the text rules can't settle. Without a key, they wait in the review queue.
    let reviewer = createBoardReviewer();
    stats.aiReview = reviewer ? "on" : "off (no ANTHROPIC_API_KEY)";
    const onReviewUnavailable = (reason: string) => {
      if (!reviewer) return;
      reviewer = null;
      stats.aiReview = `stopped: ${reason}`;
      console.warn(`AI board check stopped: ${reason}. Boards stay in the review queue.`);
    };
    const aiUsage = reviewer?.usage ?? null;

    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const target = targets[cursor++];
        const started = Date.now();
        const result = await crawlSource(db, target, { dryRun: args["dry-run"], matchSponsor, reviewer, onReviewUnavailable });
        record(target, result);
        const label = `${target.ats}/${target.identifier}${target.status === "unverified" ? " (unverified)" : ""}`;
        const detail = result.outcome === "error" ? result.error.slice(0, 120) : `${result.ukJobs} UK jobs${result.outcome === "stored" ? `, +${result.inserted} new, ${result.expired} expired${result.promoted ? ", PROMOTED" : ""}` : ` → ${result.outcome}`}`;
        console.log(`  ${result.outcome === "error" ? "✗" : "✓"} ${label}: ${detail} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
      }
    };
    await Promise.all(Array.from({ length: SOURCE_CONCURRENCY }, worker));

    stats.blockedHosts = getBlockedHosts().map((e) => e.message);
    // Claude Opus 5.5 list price: $4 per million input tokens, $20 per million output tokens.
    const aiCostUsd = aiUsage ? (aiUsage.inputTokens * 4 + aiUsage.outputTokens * 20) / 1_000_000 : 0;
    const summary = { ...stats, aiUsage: aiUsage ? { ...aiUsage, estimatedCostUsd: Number(aiCostUsd.toFixed(4)) } : null };
    console.log(JSON.stringify(summary, null, 2));
    await finish("succeeded", summary);
    await saveReport("scrape", summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Scrape\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
    }
  } catch (error) {
    await finish("failed", {}, error instanceof Error ? error.message : String(error)).catch(() => {});
    throw error;
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
