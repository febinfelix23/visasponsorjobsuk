/**
 * Scores live jobs: occupation code, seniority, parsed salary and the sponsorship
 * badge with its reasons. Re-scores anything changed since it was last scored, or
 * scored by an older rules version.
 *
 *   npm run score:jobs              # score what's due
 *   npm run score:jobs -- --all     # re-score every live job
 *   npm run score:jobs -- --dry-run # score and print the breakdown, write nothing
 */
import "./load-env";

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { jobClassifications, jobs, jobSources, sponsors } from "@/lib/db/schema";
import { saveReport } from "@/lib/notify/run-report";
import { classificationKey } from "@/lib/scoring/ai-classify";
import { SCORE_VERSION, scoreJob, type ScoreResult } from "@/lib/scoring/score";

const BATCH = 1000;

const { values: args } = parseArgs({
  options: { all: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false } },
});

const countBy = (target: Record<string, number>, key: string) => (target[key] = (target[key] ?? 0) + 1);

async function main() {
  const db = createDb(undefined, { max: 2 });
  const stats = {
    scored: 0,
    sponsorability: {} as Record<string, number>,
    seniority: {} as Record<string, number>,
    withOccupation: 0,
    field: {} as Record<string, number>,
    withSalary: 0,
    graduateSchemes: 0,
    scoreVersion: SCORE_VERSION,
    dryRun: args["dry-run"],
  };

  try {
    // AI classifications, one per distinct title; the scorer falls back to rules without one.
    const classified = new Map(
      (await db.select().from(jobClassifications)).map((c) => [c.key, { socCode: c.socCode, field: c.field }]),
    );
    let fromAi = 0;
    let lastId = 0;
    for (;;) {
      const due = args.all
        ? undefined
        : or(sql`${jobs.scoreVersion} is distinct from ${SCORE_VERSION}`, sql`${jobs.scoredAt} is null`, sql`${jobs.updatedAt} > ${jobs.scoredAt}`);
      const rows = await db
        .select({
          id: jobs.id,
          title: jobs.title,
          description: jobs.description,
          salaryText: jobs.salaryText,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryPeriod: jobs.salaryPeriod,
          employmentType: jobs.employmentType,
          sector: jobs.sector,
          ats: jobSources.ats,
          sponsorName: sponsors.name,
          sponsorStatus: sponsors.status,
          sponsorSkilledWorker: sponsors.isSkilledWorker,
        })
        .from(jobs)
        .innerJoin(jobSources, eq(jobSources.id, jobs.sourceId))
        .leftJoin(sponsors, eq(sponsors.id, jobs.sponsorId))
        .where(and(eq(jobs.status, "live"), gt(jobs.id, lastId), due))
        .orderBy(asc(jobs.id))
        .limit(BATCH);
      if (rows.length === 0) break;
      lastId = rows.at(-1)!.id;

      const results: (ScoreResult & { id: number })[] = rows.map((r) => {
        const ai = classified.get(classificationKey(r.title, r.sector));
        if (ai) fromAi++;
        return {
        id: r.id,
        ...scoreJob({
          aiSocCode: ai?.socCode ?? null,
          aiField: ai?.field ?? null,
          title: r.title,
          description: r.description,
          salaryText: r.salaryText,
          salaryMin: r.salaryMin,
          salaryMax: r.salaryMax,
          salaryPeriod: r.salaryPeriod,
          employmentType: r.employmentType,
          sector: r.sector,
          isNhsJobs: r.ats === "nhs_jobs",
          licensedSponsor: r.sponsorStatus === "active" && r.sponsorSkilledWorker === true,
          sponsorName: r.sponsorName,
        }),
        };
      });

      for (const r of results) {
        stats.scored++;
        countBy(stats.sponsorability, r.sponsorability);
        countBy(stats.seniority, r.seniority);
        countBy(stats.field, r.field ?? "unknown");
        if (r.socCode) stats.withOccupation++;
        if (r.salaryAnnualMin !== null) stats.withSalary++;
        if (r.isGradScheme) stats.graduateSchemes++;
      }
      if (args["dry-run"]) continue;

      const tx = db.$client;
      // One UPDATE … FROM unnest() per batch. Reasons travel as JSON text and are cast back.
      // salary_min/max/period are left alone: they hold only what the ATS supplied. Writing
      // parsed values there made the next run trust its own earlier mistakes.
      await tx`
        update jobs j set
          soc_code = v.soc_code,
          field = v.field,
          seniority = v.seniority::seniority,
          is_grad_scheme = v.is_grad_scheme,
          sponsorability = v.sponsorability::sponsorability,
          reasons = v.reasons::jsonb,
          salary_annual_min = v.salary_annual_min,
          salary_annual_max = v.salary_annual_max,
          score_version = ${SCORE_VERSION},
          scored_at = now()
        from unnest(
          ${tx.array(results.map((r) => r.id))}::bigint[],
          ${tx.array(results.map((r) => r.socCode))}::text[],
          ${tx.array(results.map((r) => r.field))}::text[],
          ${tx.array(results.map((r) => r.seniority))}::text[],
          ${tx.array(results.map((r) => String(r.isGradScheme)))}::boolean[],
          ${tx.array(results.map((r) => r.sponsorability))}::text[],
          ${tx.array(results.map((r) => JSON.stringify(r.reasons)))}::text[],
          ${tx.array(results.map((r) => r.salaryAnnualMin))}::numeric[],
          ${tx.array(results.map((r) => r.salaryAnnualMax))}::numeric[]
        ) as v(id, soc_code, field, seniority, is_grad_scheme, sponsorability, reasons, salary_annual_min, salary_annual_max)
        where j.id = v.id
      `;
    }

    Object.assign(stats, { classifiedByAi: fromAi });
    console.log(JSON.stringify(stats, null, 2));
    if (!args["dry-run"]) await saveReport("score", stats);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Job scoring\n\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\`\n`);
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
