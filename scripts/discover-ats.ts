/**
 * Finds in-scope sponsors' job boards by probing ATS public APIs with slugs
 * guessed from their names, highest crawl priority first.
 *
 *   npm run discover:ats                          # next 3,000 sponsors due a probe
 *   npm run discover:ats -- --limit 200 --dry-run # print what would be found, write nothing
 *   npm run discover:ats -- --name "monzo"        # only sponsors whose name contains this
 */
import "./load-env";

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { startRun } from "@/lib/db/runs";
import { crawlRuns, jobSources, sponsors } from "@/lib/db/schema";
import { discoverSponsor, memoisedProbe, type Verdict } from "@/lib/discovery/discover";
import { getBlockedHosts } from "@/lib/http";

const REPROBE_AFTER_DAYS = 30;
const SPONSOR_CONCURRENCY = 12;
const WRITE_EVERY = 100;

const { values: args } = parseArgs({
  options: {
    limit: { type: "string", default: "3000" },
    "dry-run": { type: "boolean", default: false },
    name: { type: "string" },
  },
});

async function main() {
  const limit = Number(args.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");

  const db = createDb(undefined, { max: 2 });
  const runId = await startRun(db, "ats_discovery");
  const finish = (status: "succeeded" | "failed", stats: Record<string, unknown>, error?: string) =>
    db.update(crawlRuns).set({ status, stats, error, finishedAt: new Date() }).where(eq(crawlRuns.id, runId));

  try {
    // isNotNull matters: NOT IN against a subquery containing NULL matches nothing.
    const alreadySourced = db
      .select({ id: jobSources.sponsorId })
      .from(jobSources)
      .where(and(eq(jobSources.status, "active"), isNotNull(jobSources.sponsorId)));
    const due = await db
      .select({ id: sponsors.id, name: sponsors.name, tradingName: sponsors.tradingName })
      .from(sponsors)
      .where(
        and(
          eq(sponsors.inScope, true),
          eq(sponsors.status, "active"),
          // NHS bodies recruit through NHS Jobs, which has its own adapter.
          or(isNull(sponsors.sectorSource), ne(sponsors.sectorSource, "nhs_name")),
          or(isNull(sponsors.atsProbedAt), lt(sponsors.atsProbedAt, sql`now() - make_interval(days => ${REPROBE_AFTER_DAYS})`)),
          sql`${sponsors.id} not in (${alreadySourced})`,
          args.name ? ilike(sponsors.name, `%${args.name}%`) : undefined,
        ),
      )
      .orderBy(desc(sponsors.priorityScore), sponsors.id)
      .limit(limit);
    console.log(`${due.length} sponsors to probe${args["dry-run"] ? " (dry run)" : ""}`);

    const probe = memoisedProbe();
    const stats = {
      sponsors: due.length,
      probed: 0,
      withActive: 0,
      withUnverified: 0,
      errored: 0,
      requests: 0,
      byAts: {} as Record<string, number>,
      byReason: {} as Record<string, number>,
      blockedHosts: [] as string[],
    };
    let pendingSources: (Verdict & { sponsorId: number })[] = [];
    let pendingProbed: number[] = [];

    const flush = async () => {
      if (args["dry-run"] || (pendingSources.length === 0 && pendingProbed.length === 0)) return;
      const sources = pendingSources;
      const probed = pendingProbed;
      pendingSources = [];
      pendingProbed = [];
      await db.transaction(async (tx) => {
        if (sources.length > 0) {
          await tx
            .insert(jobSources)
            .values(
              sources.map((v) => ({
                sponsorId: v.sponsorId,
                ats: v.hit.ats,
                identifier: v.hit.identifier,
                careersUrl: v.hit.careersUrl,
                status: v.status,
                discovery: {
                  method: "slug_probe",
                  slug: v.slug.slug,
                  slugKind: v.slug.kind,
                  reason: v.reason,
                  boardName: v.hit.boardName,
                  ukJobs: v.ukJobs,
                },
              })),
            )
            // Several register rows can share a board; the first (highest priority) keeps it.
            .onConflictDoNothing({ target: [jobSources.ats, jobSources.identifier] });
        }
        if (probed.length > 0) {
          await tx.update(sponsors).set({ atsProbedAt: new Date() }).where(inArray(sponsors.id, probed));
        }
      });
    };

    let cursor = 0;
    let stopped = false;
    const worker = async () => {
      while (cursor < due.length && !stopped) {
        const sponsor = due[cursor++];
        const outcome = await discoverSponsor(sponsor, probe);
        stats.requests += outcome.requests;
        if (outcome.blocked) {
          // A host has blocked us: stop taking new sponsors so we don't make it worse.
          // This sponsor stays unprobed and is retried next run.
          if (!stopped) console.warn(`Stopping early: ${outcome.errors.find((e) => e.includes("rate-limiting")) ?? "host blocked"}`);
          stopped = true;
          stats.errored++;
          continue;
        }
        if (outcome.errors.length > 0 && outcome.verdicts.length === 0) {
          // Leave atsProbedAt unset so the sponsor is retried next run.
          stats.errored++;
          continue;
        }
        stats.probed++;
        pendingProbed.push(sponsor.id);
        if (outcome.verdicts.some((v) => v.status === "active")) stats.withActive++;
        else if (outcome.verdicts.length > 0) stats.withUnverified++;
        for (const v of outcome.verdicts) {
          pendingSources.push({ ...v, sponsorId: sponsor.id });
          if (v.status === "active") stats.byAts[v.hit.ats] = (stats.byAts[v.hit.ats] ?? 0) + 1;
          stats.byReason[v.reason] = (stats.byReason[v.reason] ?? 0) + 1;
          if (args["dry-run"] || args.name) {
            const board = v.hit.boardName ? `, board "${v.hit.boardName}"` : "";
            const uk = v.ukJobs !== null ? `, ${v.ukJobs} UK jobs` : "";
            console.log(`  ${v.status === "active" ? "✓" : "?"} ${sponsor.name} → ${v.hit.ats}/${v.hit.identifier} (${v.reason}${board}${uk})`);
          }
        }
        if (pendingProbed.length >= WRITE_EVERY) await flush();
        if (stats.probed % 250 === 0) console.log(`  …${stats.probed}/${due.length} probed, ${stats.withActive} boards found`);
      }
    };
    await Promise.all(Array.from({ length: SPONSOR_CONCURRENCY }, worker));
    await flush();
    stats.blockedHosts = getBlockedHosts().map((e) => e.message);

    console.log(JSON.stringify(stats, null, 2));
    await finish(stopped ? "failed" : "succeeded", stats, stopped ? "Stopped early: a host rate-limited us" : undefined);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ATS discovery\n\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\`\n`);
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
