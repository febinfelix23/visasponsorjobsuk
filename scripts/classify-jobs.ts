/**
 * Classifies live jobs whose title hasn't been classified yet at their employer (field
 * of work and SOC code) with Claude Haiku 5.5, caching one result per title and
 * employer. Run before score:jobs. Without ANTHROPIC_API_KEY it does nothing and scoring uses the rules.
 *
 *   npm run classify:jobs
 *   npm run classify:jobs -- --limit 100 --dry-run   # print results, store nothing (still billed)
 */
import "./load-env";

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { jobClassifications, jobs } from "@/lib/db/schema";
import { saveReport } from "@/lib/notify/run-report";
import {
  BATCH_SIZE,
  CLASSIFY_MODEL,
  ClassifierUnavailableError,
  classificationKey,
  createJobClassifier,
  DEFAULT_MAX_JOBS_PER_RUN,
  type ClassifyInput,
} from "@/lib/scoring/ai-classify";

const CONCURRENCY = 3;

const { values: args } = parseArgs({
  options: { limit: { type: "string" }, "dry-run": { type: "boolean", default: false } },
});

async function main() {
  const classifier = createJobClassifier();
  if (!classifier) {
    console.log("ANTHROPIC_API_KEY not set: skipping AI classification (scoring falls back to the rules).");
    return;
  }
  const limit = Number(args.limit ?? process.env.AI_CLASSIFY_MAX) || DEFAULT_MAX_JOBS_PER_RUN;
  const db = createDb(undefined, { max: 2 });
  try {
    const live = await db
      .select({ id: jobs.id, title: jobs.title, employer: jobs.employerName, industry: jobs.sector, description: jobs.description })
      .from(jobs)
      .where(eq(jobs.status, "live"));
    const known = new Set((await db.select({ key: jobClassifications.key }).from(jobClassifications)).map((r) => r.key));

    // One request item per distinct key; remember every job id that shares it.
    const pending = new Map<string, ClassifyInput & { jobIds: number[] }>();
    for (const j of live) {
      const key = classificationKey(j.title, j.employer);
      if (known.has(key)) continue;
      const entry = pending.get(key);
      if (entry) entry.jobIds.push(j.id);
      else pending.set(key, { key, title: j.title, employer: j.employer, employerIndustry: j.industry, description: j.description, jobIds: [j.id] });
    }
    const todo = [...pending.values()].slice(0, limit);
    console.log(`${pending.size} titles to classify; this run takes ${todo.length}${args["dry-run"] ? " (dry run)" : ""}`);

    const batches: (typeof todo)[] = [];
    for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));

    const stats = { titles: todo.length, classified: 0, withOccupation: 0, failedBatches: 0, byField: {} as Record<string, number>, stopped: null as string | null };
    let cursor = 0;
    let stopped = false;
    const worker = async () => {
      while (cursor < batches.length && !stopped) {
        const batch = batches[cursor++];
        let results;
        try {
          results = await classifier.classify(batch);
        } catch (error) {
          if (!(error instanceof ClassifierUnavailableError)) throw error;
          stopped = true;
          stats.stopped = error.message;
          console.warn(`Stopping: ${error.message}`);
          return;
        }
        if (results.size === 0) {
          stats.failedBatches++;
          continue;
        }
        const rows = batch.flatMap((item) => {
          const c = results.get(item.key);
          if (!c) return [];
          stats.classified++;
          if (c.socCode) stats.withOccupation++;
          stats.byField[c.field ?? "none"] = (stats.byField[c.field ?? "none"] ?? 0) + 1;
          if (args["dry-run"]) console.log(`  ${String(c.field).padEnd(15)} ${c.socCode ?? "----"}  ${item.title.slice(0, 70)}`);
          return [{ row: { key: item.key, title: item.title, employerIndustry: item.employerIndustry, socCode: c.socCode, field: c.field, model: CLASSIFY_MODEL }, jobIds: item.jobIds }];
        });
        if (args["dry-run"] || rows.length === 0) continue;
        await db
          .insert(jobClassifications)
          .values(rows.map((r) => r.row))
          .onConflictDoNothing({ target: jobClassifications.key });
        // Mark these jobs for re-scoring so the new classification takes effect.
        await db.update(jobs).set({ scoredAt: null }).where(inArray(jobs.id, rows.flatMap((r) => r.jobIds)));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const summary = { ...stats, model: CLASSIFY_MODEL, usage: classifier.usage, estimatedCostUsd: Number(classifier.costUsd().toFixed(4)) };
    console.log(JSON.stringify(summary, null, 2));
    await saveReport("classify", summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Job classification\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
