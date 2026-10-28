import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { jobs, jobSources } from "@/lib/db/schema";
import { ReviewUnavailableError, type BoardReview, type BoardReviewer } from "@/lib/discovery/ai-review";
import { ADAPTERS } from "./adapters";
import { checkAdvert, type AdvertStatus } from "./adapters/nhs-jobs";
import { snippetOf, slugify } from "./text";
import type { RawJob, SourceRef } from "./types";
import { checkSponsorInJobs } from "./verify";

const BATCH = 200;
/** A job missing from this many crawls in a row is expired (one miss can be an API hiccup). */
const EXPIRE_AFTER_MISSES = 2;
/** Every source is crawled on each twice-daily run (NHS too, so closed adverts drop out within a run or two). */
export const RECRAWL_HOURS = 12;

/**
 * GitHub starts scheduled runs late, sometimes by hours, so runs land 10 to 14 hours apart.
 * Sources falling due within this window are crawled now rather than skipped until the next run.
 */
const DUE_WINDOW_HOURS = 3;
export const dueBefore = (now: Date) => new Date(now.getTime() + DUE_WINDOW_HOURS * 3_600_000);
/**
 * Bump an adapter's version when its detail parsing changes: stored jobs from an older
 * version count as unseen, so adapters that skip known jobs (NHS Jobs, Workday,
 * SmartRecruiters) fetch each advert once more. 2: whole NHS advert, 20,000-character cap.
 */
export const DETAIL_VERSION: Record<SourceRef["ats"], number> = {
  greenhouse: 2, lever: 2, ashby: 2, smartrecruiters: 2, workable: 2, workday: 2, nhs_jobs: 2,
};

/** External IDs whose stored details are current, so their adverts needn't be fetched again. */
export function knownForDetail(stored: { externalId: string; detailVersion: number }[], ats: SourceRef["ats"]): Set<string> {
  return new Set(stored.filter((s) => s.detailVersion >= DETAIL_VERSION[ats]).map((s) => s.externalId));
}

/** Boards whose adverts can be checked one by one when a job goes missing from the listing. */
const ADVERT_CHECKS: Partial<Record<SourceRef["ats"], (externalId: string) => Promise<AdvertStatus>>> = { nhs_jobs: checkAdvert };
/** Most missing adverts checked per crawl; the rest wait for the normal two-miss rule. */
const MAX_ADVERT_CHECKS = 300;

/** Missing jobs, by what their advert showed: closed ones expire now, open ones stay, the rest count a miss. */
export function settleMissing(missing: string[], statuses: ReadonlyMap<string, AdvertStatus>) {
  const by = (s: AdvertStatus) => missing.filter((id) => statuses.get(id) === s);
  return { expire: by("closed"), keep: by("open"), count: missing.filter((id) => !["closed", "open"].includes(statuses.get(id) ?? "unknown")) };
}

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
  sponsorTown: string | null;
  sponsorCounty: string | null;
  sponsorSicCodes: string[] | null;
};

export type CrawlResult =
  | { outcome: "stored"; ukJobs: number; inserted: number; expired: number; promoted: boolean; aiPromoted: boolean }
  | { outcome: "verification_failed" | "insufficient_evidence" | "needs_review" | "ai_rejected"; ukJobs: number }
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
/**
 * One listing can name the same job twice (Workday pages shift while being paged through),
 * and an upsert can't touch a row twice in one statement. Keeps one copy per job: the
 * first with a description, else the first seen.
 */
export function uniqueJobs(raw: RawJob[]): RawJob[] {
  const byId = new Map<string, RawJob>();
  for (const job of raw) {
    const kept = byId.get(job.externalId);
    if (!kept || (!kept.description && job.description)) byId.set(job.externalId, job);
  }
  return [...byId.values()];
}

type CrawlOptions = {
  dryRun: boolean;
  matchSponsor: (employer: string) => number | null;
  /** AI check for boards the text rules can't settle; null when no API key is configured. */
  reviewer?: BoardReviewer | null;
  /** Called once if the AI check stops working mid-run (key rejected, credit exhausted). */
  onReviewUnavailable?: (reason: string) => void;
};

/** Crawls one source. Any failure is recorded against that source and never stops the run. */
export async function crawlSource(db: Db, target: CrawlTarget, options: CrawlOptions): Promise<CrawlResult> {
  try {
    return await crawlOne(db, target, options);
  } catch (error) {
    // A failed query's own message is the whole SQL statement; the database's reason is in `cause`.
    const reason = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    const message = reason instanceof Error ? reason.message : String(reason);
    if (!options.dryRun) await recordFailure(db, target, message).catch(() => {});
    return { outcome: "error", error: message };
  }
}

async function crawlOne(db: Db, target: CrawlTarget, options: CrawlOptions): Promise<CrawlResult> {
  const adapter = ADAPTERS[target.ats];
  if (!adapter) return { outcome: "error", error: `No adapter for ${target.ats}` };

  let raw: RawJob[];
  try {
    const stored = await db.select({ externalId: jobs.externalId, detailVersion: jobs.detailVersion }).from(jobs).where(eq(jobs.sourceId, target.id));
    raw = uniqueJobs(await adapter(target, { knownIds: knownForDetail(stored, target.ats) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) await recordFailure(db, target, message);
    return { outcome: "error", error: message };
  }

  let promoted = false;
  let promotion: Record<string, unknown> = { verifiedBy: "job_text" };
  if (target.status === "unverified") {
    const check = raw.length === 0 ? "insufficient" : checkSponsorInJobs(raw, [target.sponsorName, target.sponsorTradingName], target.sponsorSector);
    if (check === "insufficient") {
      if (!options.dryRun) {
        await db
          .update(jobSources)
          .set({ lastCrawledAt: sql`now()`, lastJobCount: raw.length, nextCrawlAt: sql`now() + make_interval(days => ${UNVERIFIED_RECHECK_DAYS})` })
          .where(eq(jobSources.id, target.id));
      }
      return { outcome: "insufficient_evidence", ukJobs: raw.length };
    }
    if (check === "needs_review") {
      // How the board describes its company, for the AI check and any human reviewer.
      const sample = raw.find((r) => r.description)?.description ?? "";
      const about = (/\babout\b[\s\S]{0,400}/i.exec(sample)?.[0] ?? sample.slice(0, 400)).replace(/\s+/g, " ").trim();
      const evidence = {
        about,
        sampleTitles: raw.slice(0, 5).map((r) => r.title),
        sampleLocations: [...new Set(raw.map((r) => r.locationText).filter((l): l is string => !!l))].slice(0, 5),
      };

      // Ask the AI once per board; a stored verdict (including "unsure") is never re-billed.
      let aiReview: BoardReview | null = null;
      if (options.reviewer && !target.discovery?.aiReview && !options.dryRun) {
        try {
          aiReview = await options.reviewer.review({
            sponsor: {
              name: target.sponsorName ?? target.identifier,
              tradingName: target.sponsorTradingName,
              town: target.sponsorTown ?? "",
              county: target.sponsorCounty,
              sector: target.sponsorSector ?? null,
              sicCodes: target.sponsorSicCodes,
            },
            board: {
              ats: target.ats,
              identifier: target.identifier,
              boardName: (target.discovery?.boardName as string | null | undefined) ?? null,
              ...evidence,
            },
          });
        } catch (error) {
          if (!(error instanceof ReviewUnavailableError)) throw error;
          options.onReviewUnavailable?.(error.message);
        }
      }
      const reviewRecord = aiReview ? { aiReview: { ...aiReview, at: new Date().toISOString() } } : {};

      if (aiReview?.verdict === "different") {
        await db
          .update(jobSources)
          .set({
            status: "disabled",
            lastCrawledAt: sql`now()`,
            lastJobCount: raw.length,
            discovery: sql`coalesce(${jobSources.discovery}, '{}'::jsonb) || ${JSON.stringify({ ...evidence, ...reviewRecord, needsReview: false, disabledReason: "ai_wrong_company" })}::jsonb`,
          })
          .where(eq(jobSources.id, target.id));
        return { outcome: "ai_rejected", ukJobs: raw.length };
      }
      if (aiReview?.verdict === "same") {
        promotion = { verifiedBy: "ai_review", needsReview: false, ...evidence, ...reviewRecord };
      } else {
        if (!options.dryRun) {
          await db
            .update(jobSources)
            .set({
              lastCrawledAt: sql`now()`,
              lastJobCount: raw.length,
              nextCrawlAt: sql`now() + make_interval(days => ${UNVERIFIED_RECHECK_DAYS})`,
              discovery: sql`coalesce(${jobSources.discovery}, '{}'::jsonb) || ${JSON.stringify({ needsReview: true, ...evidence, ...reviewRecord })}::jsonb`,
            })
            .where(eq(jobSources.id, target.id));
        }
        return { outcome: "needs_review", ukJobs: raw.length };
      }
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

  if (options.dryRun) return { outcome: "stored", ukJobs: raw.length, inserted: 0, expired: 0, promoted, aiPromoted: false };

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
        // A row without details (detail fetch skipped) keeps the stored version on update.
        detailVersion: r.description === undefined ? 0 : DETAIL_VERSION[target.ats],
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
          // ATS-supplied pay only (Lever, Ashby), always taken fresh; those adapters never send partial rows.
          salaryMin: sql`excluded.salary_min`,
          salaryMax: sql`excluded.salary_max`,
          salaryPeriod: sql`excluded.salary_period`,
          salaryText: sql`coalesce(excluded.salary_text, ${jobs.salaryText})`,
          employmentType: sql`coalesce(excluded.employment_type, ${jobs.employmentType})`,
          department: sql`coalesce(excluded.department, ${jobs.department})`,
          sector: sql`coalesce(excluded.sector, ${jobs.sector})`,
          sponsorId: sql`coalesce(excluded.sponsor_id, ${jobs.sponsorId})`,
          description: sql`coalesce(excluded.description, ${jobs.description})`,
          detailVersion: sql`case when excluded.description is null then ${jobs.detailVersion} else excluded.detail_version end`,
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
  let expiredNow = 0;
  const check = ADVERT_CHECKS[target.ats];
  if (check) {
    const missing = (
      await db
        .select({ id: jobs.externalId })
        .from(jobs)
        .where(and(eq(jobs.sourceId, target.id), eq(jobs.status, "live"), sql`${jobs.externalId} <> all(${sql.param(seen)}::text[])`))
    ).map((r) => r.id);
    const statuses = new Map<string, AdvertStatus>();
    for (const id of missing.slice(0, MAX_ADVERT_CHECKS)) statuses.set(id, await check(id));
    const settled = settleMissing(missing, statuses);
    if (settled.expire.length > 0) {
      await db
        .update(jobs)
        .set({ status: "expired", missedCrawls: sql`${jobs.missedCrawls} + 1`, updatedAt: sql`now()` })
        .where(and(eq(jobs.sourceId, target.id), inArray(jobs.externalId, settled.expire)));
      expiredNow = settled.expire.length;
    }
    if (settled.keep.length > 0) {
      // Still open on the board, just outside the listing we crawl: not a miss.
      await db
        .update(jobs)
        .set({ missedCrawls: 0, lastSeenAt: sql`now()` })
        .where(and(eq(jobs.sourceId, target.id), inArray(jobs.externalId, settled.keep)));
      seen.push(...settled.keep);
    }
  }
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
      nextCrawlAt: hoursFromNow(RECRAWL_HOURS),
      ...(promoted
        ? { discovery: sql`coalesce(${jobSources.discovery}, '{}'::jsonb) || ${JSON.stringify(promotion)}::jsonb` }
        : {}),
    })
    .where(eq(jobSources.id, target.id));

  return {
    outcome: "stored",
    ukJobs: raw.length,
    inserted,
    expired: expiredNow + expired.filter((e) => e.status === "expired").length,
    promoted,
    aiPromoted: promotion.verifiedBy === "ai_review",
  };
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
