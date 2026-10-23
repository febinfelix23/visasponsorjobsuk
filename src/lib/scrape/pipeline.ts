import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { jobs, jobSources } from "@/lib/db/schema";
import { ADAPTERS } from "./adapters";
import { snippetOf, slugify } from "./text";
import type { RawJob, SourceRef } from "./types";
import { checkSponsorInJobs } from "./verify";

const BATCH = 200;
/** A job missing from this many crawls in a row is expired (one miss can be an API hiccup). */
const EXPIRE_AFTER_MISSES = 2;
const RECRAWL_HOURS: Partial<Record<SourceRef["ats"], number>> = { nhs_jobs: 24 };
const DEFAULT_RECRAWL_HOURS = 12;
/** Unverified boards with too few UK jobs to judge are checked again after this. */
const UNVERIFIED_RECHECK_DAYS = 7;
const FAILING_AFTER = 3;

type Sector = (typeof jobs.$inferInsert)["sector"];

export type CrawlTarget = SourceRef & {
  status: "active" | "unverified" | "failing" | "disabled";
  sponsorId: number | null;
  sponsorName: string | null;
  sponsorTradingName: string | null;
  sponsorSector: Sector | null;
};

export type CrawlResult =
  | { outcome: "stored"; ukJobs: number; inserted: number; expired: number; promoted: boolean }
  | { outcome: "verification_failed" | "insufficient_evidence"; ukJobs: number }
  | { outcome: "error"; error: string };

/** Display name for jobs from a sponsor's own board: "Roofoods Ltd t/a Deliveroo" shows as "Deliveroo". */
export const employerDisplayName = (target: CrawlTarget, raw: RawJob) =>
  raw.employerName ?? target.sponsorTradingName ?? target.sponsorName ?? target.identifier;

/** URL-safe, unique, stable: "graduate-software-engineer-monzo-bank-3f9a1c". */
export function jobSlug(title: string, employer: string, sourceId: number, externalId: string): string {
  const hash = createHash("sha1").update(`${sourceId}:${externalId}`).digest("hex").slice(0, 6);
  return [slugify(title, 60), slugify(employer, 30), hash].filter(Boolean).join("-");
}

const hoursFromNow = (hours: number) => sql`now() + make_interval(hours => ${hours})`;

/**
 * Crawls one source and writes its UK jobs. `matchSponsor` resolves an advertised
 * employer to a sponsor ID on shared boards (NHS Jobs).
 */
export async function crawlSource(
  db: Db,
  target: CrawlTarget,
  options: { dryRun: boolean; matchSponsor: (employer: string) => number | null },
): Promise<CrawlResult> {
  const adapter = ADAPTERS[target.ats];
  if (!adapter) return { outcome: "error", error: `No adapter for ${target.ats}` };

  let raw: RawJob[];
  try {
    const known = await db.select({ id: jobs.externalId }).from(jobs).where(eq(jobs.sourceId, target.id));
    raw = await adapter(target, { knownIds: new Set(known.map((k) => k.id)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) await recordFailure(db, target, message);
    return { outcome: "error", error: message };
  }

  let promoted = false;
  if (target.status === "unverified") {
    const check = raw.length === 0 ? "insufficient" : checkSponsorInJobs(raw, [target.sponsorName, target.sponsorTradingName]);
    if (check === "insufficient") {
      if (!options.dryRun) {
        await db
          .update(jobSources)
          .set({ lastCrawledAt: sql`now()`, lastJobCount: raw.length, nextCrawlAt: sql`now() + make_interval(days => ${UNVERIFIED_RECHECK_DAYS})` })
          .where(eq(jobSources.id, target.id));
      }
      return { outcome: "insufficient_evidence", ukJobs: raw.length };
    }
    if (check === "rejected") {
      if (!options.dryRun) {
        await db
          .update(jobSources)
          .set({
            status: "disabled",
            lastCrawledAt: sql`now()`,
            lastJobCount: raw.length,
            discovery: sql`coalesce(${jobSources.discovery}, '{}'::jsonb) || ${JSON.stringify({ disabledReason: "sponsor_not_named_in_jobs" })}::jsonb`,
          })
          .where(eq(jobSources.id, target.id));
      }
      return { outcome: "verification_failed", ukJobs: raw.length };
    }
    promoted = true;
  }

  if (options.dryRun) return { outcome: "stored", ukJobs: raw.length, inserted: 0, expired: 0, promoted };

  const sector: Sector | null = target.ats === "nhs_jobs" ? "healthcare" : target.sponsorSector;
  let inserted = 0;
  for (let i = 0; i < raw.length; i += BATCH) {
    const rows = raw.slice(i, i + BATCH).map((r) => {
      const employer = employerDisplayName(target, r);
      return {
        sourceId: target.id,
        sponsorId: target.ats === "nhs_jobs" ? (r.employerName ? options.matchSponsor(r.employerName) : null) : target.sponsorId,
        externalId: r.externalId,
        slug: jobSlug(r.title, employer, target.id, r.externalId),
        title: r.title,
        employerName: employer,
        locationText: r.locationText,
        isRemote: r.isRemote,
        salaryMin: r.salaryMin,
        salaryMax: r.salaryMax,
        salaryPeriod: r.salaryPeriod,
        salaryText: r.salaryText,
        employmentType: r.employmentType,
        department: r.department,
        sector,
        description: r.description ?? null,
        snippet: r.description ? snippetOf(r.description) : null,
        applyUrl: r.applyUrl,
        postedAt: r.postedAt,
        closingDate: r.closingDate,
      };
    });
    const written = await db
      .insert(jobs)
      .values(rows)
      .onConflictDoUpdate({
        target: [jobs.sourceId, jobs.externalId],
        // Partial rows (detail not re-fetched) carry nulls: keep what's stored.
        set: {
          title: sql`excluded.title`,
          applyUrl: sql`coalesce(excluded.apply_url, ${jobs.applyUrl})`,
          locationText: sql`coalesce(excluded.location_text, ${jobs.locationText})`,
          isRemote: sql`excluded.is_remote or ${jobs.isRemote}`,
          salaryMin: sql`coalesce(excluded.salary_min, ${jobs.salaryMin})`,
          salaryMax: sql`coalesce(excluded.salary_max, ${jobs.salaryMax})`,
          salaryPeriod: sql`coalesce(excluded.salary_period, ${jobs.salaryPeriod})`,
          salaryText: sql`coalesce(excluded.salary_text, ${jobs.salaryText})`,
          employmentType: sql`coalesce(excluded.employment_type, ${jobs.employmentType})`,
          department: sql`coalesce(excluded.department, ${jobs.department})`,
          sector: sql`coalesce(excluded.sector, ${jobs.sector})`,
          sponsorId: sql`coalesce(excluded.sponsor_id, ${jobs.sponsorId})`,
          description: sql`coalesce(excluded.description, ${jobs.description})`,
          snippet: sql`coalesce(excluded.snippet, ${jobs.snippet})`,
          postedAt: sql`coalesce(excluded.posted_at, ${jobs.postedAt})`,
          closingDate: sql`coalesce(excluded.closing_date, ${jobs.closingDate})`,
          status: "live",
          missedCrawls: 0,
          lastSeenAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      })
      // xmax = 0 only for freshly inserted rows: a cheap way to count inserts in an upsert.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    inserted += written.filter((w) => w.inserted).length;
  }

  const seen = raw.map((r) => r.externalId);
  const expired = await db
    .update(jobs)
    .set({
      missedCrawls: sql`${jobs.missedCrawls} + 1`,
      status: sql`case when ${jobs.missedCrawls} + 1 >= ${EXPIRE_AFTER_MISSES} then 'expired'::job_status else ${jobs.status} end`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(jobs.sourceId, target.id), eq(jobs.status, "live"), sql`${jobs.externalId} <> all(${sql.param(seen)}::text[])`))
    .returning({ status: jobs.status });

  await db
    .update(jobSources)
    .set({
      status: "active",
      consecutiveFailures: 0,
      lastError: null,
      lastCrawledAt: sql`now()`,
      lastJobCount: raw.length,
      nextCrawlAt: hoursFromNow(RECRAWL_HOURS[target.ats] ?? DEFAULT_RECRAWL_HOURS),
      ...(promoted
        ? { discovery: sql`coalesce(${jobSources.discovery}, '{}'::jsonb) || '{"verifiedBy":"job_text"}'::jsonb` }
        : {}),
    })
    .where(eq(jobSources.id, target.id));

  return { outcome: "stored", ukJobs: raw.length, inserted, expired: expired.filter((e) => e.status === "expired").length, promoted };
}

async function recordFailure(db: Db, target: CrawlTarget, message: string) {
  const failures = (await db
    .update(jobSources)
    .set({ consecutiveFailures: sql`${jobSources.consecutiveFailures} + 1`, lastError: message.slice(0, 500), lastCrawledAt: sql`now()` })
    .where(eq(jobSources.id, target.id))
    .returning({ n: jobSources.consecutiveFailures }))[0]?.n ?? 1;
  // Back off exponentially (2h, 4h, 8h … capped at a day); a board that 404s repeatedly is gone.
  const backoffHours = Math.min(24, 2 ** failures);
  const gone = /\b404\b/.test(message) && failures >= FAILING_AFTER;
  await db
    .update(jobSources)
    .set({
      status: gone ? "disabled" : failures >= FAILING_AFTER && target.status === "active" ? "failing" : sql`${jobSources.status}`,
      nextCrawlAt: hoursFromNow(backoffHours),
    })
    .where(eq(jobSources.id, target.id));
}
