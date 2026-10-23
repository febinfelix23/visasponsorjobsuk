/**
 * Sends the "needs review" queue (boards the text rules couldn't settle) through the
 * AI check once. New boards are checked automatically during scrapes; this clears
 * boards queued before the check existed, or after the key was unavailable.
 *
 *   npm run review:boards                 # review up to AI_REVIEW_MAX boards (default 200)
 *   npm run review:boards -- --dry-run    # print verdicts, change nothing (still billed)
 */
import "./load-env";

import { parseArgs } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { jobSources, sponsors } from "@/lib/db/schema";
import { createBoardReviewer, ReviewUnavailableError } from "@/lib/discovery/ai-review";
import { splitTradingName } from "@/lib/sponsors/normalise";

const { values: args } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });

async function main() {
  const reviewer = createBoardReviewer();
  if (!reviewer) throw new Error("ANTHROPIC_API_KEY is not set");
  const db = createDb(undefined, { max: 1 });
  try {
    const queue = await db
      .select({
        id: jobSources.id,
        ats: jobSources.ats,
        identifier: jobSources.identifier,
        discovery: jobSources.discovery,
        name: sponsors.name,
        tradingName: sponsors.tradingName,
        town: sponsors.town,
        county: sponsors.county,
        sector: sponsors.sector,
        sicCodes: sponsors.sicCodes,
      })
      .from(jobSources)
      .innerJoin(sponsors, eq(sponsors.id, jobSources.sponsorId))
      .where(and(eq(jobSources.status, "unverified"), sql`${jobSources.discovery}->>'needsReview' = 'true'`, sql`${jobSources.discovery}->'aiReview' is null`));
    console.log(`${queue.length} boards in the review queue${args["dry-run"] ? " (dry run)" : ""}`);

    const counts = { same: 0, different: 0, unsure: 0, skipped: 0 };
    for (const b of queue) {
      const d = b.discovery ?? {};
      let review;
      try {
        review = await reviewer.review({
          sponsor: {
            name: b.name,
            tradingName: b.tradingName ?? splitTradingName(b.name).tradingName,
            town: b.town,
            county: b.county,
            sector: b.sector,
            sicCodes: b.sicCodes,
          },
          board: {
            ats: b.ats,
            identifier: b.identifier,
            boardName: (d.boardName as string | null | undefined) ?? null,
            about: (d.about as string | undefined) ?? "",
            sampleTitles: (d.sampleTitles as string[] | undefined) ?? [],
            sampleLocations: (d.sampleLocations as string[] | undefined) ?? [],
          },
        });
      } catch (error) {
        if (error instanceof ReviewUnavailableError) {
          console.error(`Stopping: ${error.message}`);
          break;
        }
        throw error;
      }
      if (!review) {
        counts.skipped++;
        continue;
      }
      counts[review.verdict]++;
      console.log(`  ${review.verdict.padEnd(9)} ${b.ats}/${b.identifier} — ${b.name}: ${review.reason}`);
      if (args["dry-run"]) continue;

      const record = { aiReview: { ...review, at: new Date().toISOString() } };
      const patch =
        review.verdict === "same"
          ? { status: "active" as const, nextCrawlAt: sql`now()`, extra: { ...record, needsReview: false, verifiedBy: "ai_review" } }
          : review.verdict === "different"
            ? { status: "disabled" as const, extra: { ...record, needsReview: false, disabledReason: "ai_wrong_company" } }
            : { extra: record };
      await db
        .update(jobSources)
        .set({
          ...(patch.status ? { status: patch.status } : {}),
          ...("nextCrawlAt" in patch ? { nextCrawlAt: patch.nextCrawlAt } : {}),
          discovery: sql`coalesce(${jobSources.discovery}, '{}'::jsonb) || ${JSON.stringify(patch.extra)}::jsonb`,
          updatedAt: sql`now()`,
        })
        .where(eq(jobSources.id, b.id));
    }
    const cost = (reviewer.usage.inputTokens * 4 + reviewer.usage.outputTokens * 20) / 1_000_000;
    console.log(JSON.stringify({ ...counts, ...reviewer.usage, estimatedCostUsd: Number(cost.toFixed(4)) }, null, 2));
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
