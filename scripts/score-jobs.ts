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
import { jobClassifications, jobReadings, jobs, jobSources, sponsors } from "@/lib/db/schema";
import { saveReport } from "@/lib/notify/run-report";
import { classificationKey, legacyClassificationKey } from "@/lib/scoring/ai-classify";
import { jobTextHash } from "@/lib/reading/text-hash";
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
    read: 0,
    unread: 0,
    graduateSchemes: 0,
    scoreVersion: SCORE_VERSION,
    dryRun: args["dry-run"],
  };

  try {
    // AI classifications, one per title and employer (or per title, from before); the scorer falls back to rules without one.
    const classified = new Map(
      (await db.select().from(jobClassifications)).map((c) => [c.key, { socCode: c.socCode, field: c.field }]),
    );
    let fromAi = 0;
    let lastId = 0;
    for (;;) {
      const due = args.all
        ? undefined
        : or(
            sql`${jobs.scoreVersion} is distinct from ${SCORE_VERSION}`,
            sql`${jobs.scoredAt} is null`,
            sql`${jobs.updatedAt} > ${jobs.scoredAt}`,
            // Read since it was last scored.
            sql`exists (select 1 from ${jobReadings} r where r.job_id = ${jobs.id} and r.read_at > ${jobs.scoredAt})`,
          );
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
          employerName: jobs.employerName,
          locationText: jobs.locationText,
          ats: jobSources.ats,
          sponsorName: sponsors.name,
          sponsorStatus: sponsors.status,
          sponsorSkilledWorker: sponsors.isSkilledWorker,
          sponsorRating: sponsors.workerRating,
          facts: jobReadings.facts,
          readAt: jobReadings.readAt,
        })
        .from(jobs)
        .innerJoin(jobSources, eq(jobSources.id, jobs.sourceId))
        .leftJoin(sponsors, eq(sponsors.id, jobs.sponsorId))
        // Only a reading of the ad's current text counts; an older one is out of date.
        .leftJoin(jobReadings, and(eq(jobReadings.jobId, jobs.id), eq(jobReadings.textHash, jobTextHash)))
        .where(and(eq(jobs.status, "live"), gt(jobs.id, lastId), due))
        .orderBy(asc(jobs.id))
        .limit(BATCH);
      if (rows.length === 0) break;
      lastId = rows.at(-1)!.id;

      const results: (ScoreResult & { id: number; readAt: Date | null })[] = rows.map((r) => {
        const ai = classified.get(classificationKey(r.title, r.employerName)) ?? classified.get(legacyClassificationKey(r.title, r.sector));
        if (ai) fromAi++;
        return {
        id: r.id,
        readAt: r.readAt,
        ...scoreJob({
          reading: r.facts,
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
          locationText: r.locationText,
          isNhsJobs: r.ats === "nhs_jobs",
          // A B-rated sponsor can't assign new Certificates of Sponsorship until it's back to A.
          licensedSponsor: r.sponsorStatus === "active" && r.sponsorSkilledWorker === true && r.sponsorRating === "A",
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
        if (r.read) stats.read++;
        else stats.unread++;
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
          read_at = v.read_at,
          experience_level = v.experience_level,
          experience_min_years = v.experience_min_years,
          meets_new_entrant_rate = v.meets_new_entrant_rate,
          meets_general_rate = v.meets_general_rate,
          -- The board's own closing date wins; the ad's text fills the gap.
          closing_date = coalesce(j.closing_date, v.closing_date),
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
          ${tx.array(results.map((r) => r.salaryAnnualMax))}::numeric[],
          ${tx.array(results.map((r) => r.readAt?.toISOString() ?? null))}::timestamptz[],
          ${tx.array(results.map((r) => r.experienceLevel))}::text[],
          ${tx.array(results.map((r) => r.experienceMinYears))}::smallint[],
          ${tx.array(results.map((r) => (r.meetsNewEntrantRate === null ? null : String(r.meetsNewEntrantRate))))}::boolean[],
          ${tx.array(results.map((r) => (r.meetsGeneralRate === null ? null : String(r.meetsGeneralRate))))}::boolean[],
          ${tx.array(results.map((r) => r.closingDate))}::date[]
        ) as v(id, soc_code, field, seniority, is_grad_scheme, sponsorability, reasons, salary_annual_min, salary_annual_max, read_at, experience_level, experience_min_years, meets_new_entrant_rate, meets_general_rate, closing_date)
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
