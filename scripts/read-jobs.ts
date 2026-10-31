/**
 * Reads live jobs whose current text has no reading yet (new, or the ad changed) with the
 * AI reader, newest first, and stores the checked facts in job_readings. Jobs without a
 * reading stay hidden from the site. Run after scrape, before score:jobs.
 *
 *   npm run read:jobs
 *   npm run read:jobs -- --limit 50              # a small batch
 *   npm run read:jobs -- --limit 20 --dry-run    # print facts, store nothing (still billed)
 *   npm run read:jobs -- --limit 20000 --concurrency 8   # a backfill
 */
import "./load-env";

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { jobReadings, jobs } from "@/lib/db/schema";
import type { ReadReport } from "@/lib/notify/format";
import { saveReport } from "@/lib/notify/run-report";
import { budgetLeftUsd, MONTHLY_CAP_USD, projectMonthUsd } from "@/lib/reading/budget";
import { createJobReader, READER_MODEL, ReaderUnavailableError } from "@/lib/reading/read-job";
import { jobTextHash } from "@/lib/reading/text-hash";

/** Most reads per run whatever the backlog: about $2 at Claude Haiku 5.5 rates. */
const DEFAULT_MAX_PER_RUN = 3000;
const DEFAULT_CONCURRENCY = 3;

const { values: args } = parseArgs({
  options: { limit: { type: "string" }, concurrency: { type: "string" }, "dry-run": { type: "boolean", default: false } },
});

const unread = sql`not exists (select 1 from ${jobReadings} r where r.job_id = ${jobs.id} and r.text_hash = ${jobTextHash})`;

async function main() {
  const db = createDb(undefined, { max: 2 });
  const report: ReadReport = { read: 0, failed: 0, stopped: null, costUsd: 0, monthToDateUsd: 0, projectedMonthUsd: 0, waiting: 0, oldestWaitingHours: null };
  try {
    const monthSpend = async () =>
      Number(
        (await db
          .select({ usd: sql<string>`coalesce(sum(${jobReadings.costUsd}), 0)` })
          .from(jobReadings)
          .where(gte(jobReadings.readAt, sql`date_trunc('month', now())`)))[0].usd,
      );
    const spentBefore = await monthSpend();
    const reader = createJobReader();

    if (!reader) report.stopped = "ANTHROPIC_API_KEY not set";
    else if (budgetLeftUsd(spentBefore) <= 0) report.stopped = `Monthly AI reading limit of $${MONTHLY_CAP_USD} reached`;
    else {
      const limit = Number(args.limit ?? process.env.AI_READ_MAX) || DEFAULT_MAX_PER_RUN;
      const due = await db
        .select({
          id: jobs.id,
          textHash: jobTextHash,
          title: jobs.title,
          employer: jobs.employerName,
          employmentType: jobs.employmentType,
          salaryText: jobs.salaryText,
          closingDate: jobs.closingDate,
          description: jobs.description,
        })
        .from(jobs)
        .where(and(eq(jobs.status, "live"), unread))
        .orderBy(desc(jobs.firstSeenAt))
        .limit(limit);
      console.log(`${due.length} jobs to read${args["dry-run"] ? " (dry run)" : ""}`);

      let spentThisRun = 0;
      const queue = [...due];
      const worker = async () => {
        for (let job = queue.shift(); job && !report.stopped; job = queue.shift()) {
          if (spentThisRun >= budgetLeftUsd(spentBefore)) {
            report.stopped = `Monthly AI reading limit of $${MONTHLY_CAP_USD} reached`;
            return;
          }
          let result;
          try {
            result = await reader.read(job);
          } catch (error) {
            if (!(error instanceof ReaderUnavailableError)) throw error;
            report.stopped = error.message;
            return;
          }
          spentThisRun += result.costUsd;
          if (!result.reading) {
            report.failed++;
            continue;
          }
          report.read++;
          if (args["dry-run"]) {
            const r = result.reading;
            console.log(`  #${job.id} ${job.title.slice(0, 50)} → ${r.sponsorship.status}${r.sponsorship.verified ? "" : " (unverified)"} | ${r.contract.type} | ${r.hours.pattern} | ${r.experience.level}`);
            continue;
          }
          await db
            .insert(jobReadings)
            .values({ jobId: job.id, textHash: job.textHash, model: READER_MODEL, facts: result.reading, costUsd: result.costUsd })
            .onConflictDoNothing();
        }
      };
      await Promise.all(Array.from({ length: Number(args.concurrency) || DEFAULT_CONCURRENCY }, worker));
      report.costUsd = Number(spentThisRun.toFixed(4));
    }

    report.monthToDateUsd = Number((args["dry-run"] ? spentBefore + report.costUsd : await monthSpend()).toFixed(2));
    report.projectedMonthUsd = projectMonthUsd(report.monthToDateUsd, new Date());
    // Waiting since the job's text last changed (or it was first seen).
    const [waiting] = await db
      .select({ count: sql<number>`count(*)::int`, oldest: sql<string | null>`min(${jobs.updatedAt})` })
      .from(jobs)
      .where(and(eq(jobs.status, "live"), unread));
    report.waiting = waiting.count;
    report.oldestWaitingHours = waiting.oldest ? Math.floor((Date.now() - new Date(waiting.oldest).getTime()) / 3_600_000) : null;

    console.log(JSON.stringify(report, null, 2));
    if (!args["dry-run"]) await saveReport("read", report);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Job reading\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
