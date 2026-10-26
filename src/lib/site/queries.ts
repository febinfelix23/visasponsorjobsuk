import { cacheLife } from "next/cache";
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clicks, jobs, jobSources, sponsors } from "@/lib/db/schema";
import type { Reason, Sponsorability } from "@/lib/scoring/score";
import { slugify } from "@/lib/scrape/text";

import type { FieldKey } from "@/lib/scoring/fields";

/** What a graduate wants first: confirmed or likely sponsorship, then roles worth a question. */
export const BADGE_ORDER: Sponsorability[] = ["sponsorship_mentioned", "likely_eligible", "check_with_employer", "unknown", "ineligible"];

export const SORTS = ["best", "newest", "salary"] as const;
export type Sort = (typeof SORTS)[number];

export type Filters = {
  q?: string;
  /** Town, city or region, matched against the job's location. */
  location?: string;
  field?: FieldKey;
  /** "passes": sponsorship mentioned or likely eligible (default). "all": everything except ineligible. */
  show: "passes" | "all";
  includeSenior: boolean;
  gradSchemes: boolean;
  sort: Sort;
  page: number;
};

export const PAGE_SIZE = 25;

export type JobListItem = {
  id: number;
  slug: string;
  title: string;
  employerName: string;
  locationText: string | null;
  /** The kind of work, from the occupation code. */
  field: string | null;
  /** The employer's industry. */
  sector: string | null;
  salaryAnnualMin: number | null;
  salaryAnnualMax: number | null;
  sponsorability: Sponsorability;
  seniority: string;
  isGradScheme: boolean;
  closingDate: string | null;
  firstSeenAt: string;
  /** First seen in the last three days, judged when the (cached) query ran. */
  isNew: boolean;
};

export const listColumns = {
  id: jobs.id,
  slug: jobs.slug,
  title: jobs.title,
  employerName: jobs.employerName,
  locationText: jobs.locationText,
  field: jobs.field,
  sector: jobs.sector,
  salaryAnnualMin: jobs.salaryAnnualMin,
  salaryAnnualMax: jobs.salaryAnnualMax,
  sponsorability: jobs.sponsorability,
  seniority: jobs.seniority,
  isGradScheme: jobs.isGradScheme,
  closingDate: jobs.closingDate,
  firstSeenAt: jobs.firstSeenAt,
  // Aliased so it can also be selected back out of a subquery (postCandidates).
  isNew: sql<boolean>`${jobs.firstSeenAt} > now() - interval '3 days'`.as("is_new"),
};

export const toItem = (r: { firstSeenAt: Date } & Omit<JobListItem, "firstSeenAt">): JobListItem => ({
  ...r,
  firstSeenAt: r.firstSeenAt.toISOString(),
});

const badgeRank = sql`array_position(array['sponsorship_mentioned','likely_eligible','check_with_employer','unknown','ineligible']::sponsorability[], ${jobs.sponsorability})`;

/** Today in the UK, where closing dates are set; the database clock is UTC. */
const ukToday = sql`(now() at time zone 'Europe/London')::date`;

/**
 * A job worth listing: still on the employer's board and not past its closing date. A
 * board can keep an ad up for a day or two after it closes, so "live" alone isn't enough.
 */
const isOpen = and(eq(jobs.status, "live"), or(isNull(jobs.closingDate), gte(jobs.closingDate, ukToday)))!;

const escapeLike = (s: string) => s.replace(/[%_\\]/g, "\\$&");

const ORDER: Record<Sort, SQL[]> = {
  best: [badgeRank, desc(jobs.isGradScheme), desc(jobs.firstSeenAt)],
  newest: [desc(jobs.firstSeenAt), badgeRank],
  salary: [sql`${jobs.salaryAnnualMin} desc nulls last`, badgeRank, desc(jobs.firstSeenAt)],
};

function whereFor(f: Filters): SQL | undefined {
  const parts: (SQL | undefined)[] = [isOpen];
  parts.push(f.show === "passes" ? inArray(jobs.sponsorability, ["sponsorship_mentioned", "likely_eligible"]) : ne(jobs.sponsorability, "ineligible"));
  if (!f.includeSenior) parts.push(ne(jobs.seniority, "senior"));
  if (f.gradSchemes) parts.push(eq(jobs.isGradScheme, true));
  // Filter by the kind of work, not the employer's industry: Monzo's software roles are Software & IT.
  if (f.field) parts.push(eq(jobs.field, f.field));
  if (f.location) parts.push(ilike(jobs.locationText, `%${escapeLike(f.location)}%`));
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    parts.push(or(ilike(jobs.title, like), ilike(jobs.employerName, like), ilike(jobs.locationText, like)));
  }
  return and(...parts);
}

export async function searchJobs(f: Filters): Promise<{ items: JobListItem[]; total: number }> {
  "use cache";
  // Jobs change twice a day; a few minutes' staleness is invisible.
  cacheLife("minutes");
  const db = getDb();
  const where = whereFor(f);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(listColumns)
      .from(jobs)
      .where(where)
      .orderBy(...ORDER[f.sort])
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(jobs).where(where),
  ]);
  return { items: rows.map(toItem), total };
}

export async function fieldCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheLife("minutes");
  const rows = await getDb()
    .select({ field: jobs.field, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(isOpen, inArray(jobs.sponsorability, ["sponsorship_mentioned", "likely_eligible"]), ne(jobs.seniority, "senior")))
    .groupBy(jobs.field);
  return Object.fromEntries(rows.map((r) => [r.field ?? "other", r.n]));
}

export type JobDetail = JobListItem & {
  snippet: string | null;
  salaryText: string | null;
  employmentType: string | null;
  department: string | null;
  socCode: string | null;
  reasons: Reason[];
  postedAt: string | null;
  isRemote: boolean;
  /** Past its closing date (UK time) but still on the board; the page says so. */
  closed: boolean;
  ats: string;
  sponsor: { slug: string; name: string; town: string; rating: string | null; status: string } | null;
};

export const sponsorSlug = (s: { id: number; name: string }) => `${slugify(s.name, 60)}-${s.id}`;
export const sponsorIdFromSlug = (slug: string) => {
  const id = Number(/-(\d+)$/.exec(slug)?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export async function getJob(slug: string): Promise<JobDetail | null> {
  "use cache";
  cacheLife("hours");
  const [r] = await getDb()
    .select({
      ...listColumns,
      id: jobs.id,
      snippet: jobs.snippet,
      salaryText: jobs.salaryText,
      employmentType: jobs.employmentType,
      department: jobs.department,
      socCode: jobs.socCode,
      reasons: jobs.reasons,
      postedAt: jobs.postedAt,
      isRemote: jobs.isRemote,
      status: jobs.status,
      closed: sql<boolean>`coalesce(${jobs.closingDate} < ${ukToday}, false)`,
      ats: jobSources.ats,
      sponsorId: sponsors.id,
      sponsorName: sponsors.name,
      sponsorTown: sponsors.town,
      sponsorRating: sponsors.workerRating,
      sponsorStatus: sponsors.status,
    })
    .from(jobs)
    .innerJoin(jobSources, eq(jobSources.id, jobs.sourceId))
    .leftJoin(sponsors, eq(sponsors.id, jobs.sponsorId))
    .where(eq(jobs.slug, slug))
    .limit(1);
  if (!r || r.status !== "live") return null;
  return {
    ...toItem(r),
    id: r.id,
    snippet: r.snippet,
    salaryText: r.salaryText,
    employmentType: r.employmentType,
    department: r.department,
    socCode: r.socCode,
    reasons: r.reasons as Reason[],
    postedAt: r.postedAt?.toISOString() ?? null,
    isRemote: r.isRemote,
    closed: r.closed,
    ats: r.ats,
    sponsor: r.sponsorId
      ? { slug: sponsorSlug({ id: r.sponsorId, name: r.sponsorName! }), name: r.sponsorName!, town: r.sponsorTown!, rating: r.sponsorRating, status: r.sponsorStatus! }
      : null,
  };
}

/** Newest jobs, prerendered at build time; every other job renders on its first visit and is then cached. */
export async function recentJobSlugs(limit = 50): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const rows = await getDb()
    .select({ slug: jobs.slug })
    .from(jobs)
    .where(and(isOpen, inArray(jobs.sponsorability, ["sponsorship_mentioned", "likely_eligible"])))
    .orderBy(desc(jobs.firstSeenAt))
    .limit(limit);
  return rows.map((r) => r.slug);
}

export type SponsorDetail = {
  id: number;
  name: string;
  town: string;
  county: string | null;
  rating: string | null;
  routes: string[];
  status: string;
  sector: string | null;
  firstSeenOn: string;
  jobs: JobListItem[];
};

export async function getSponsor(id: number): Promise<SponsorDetail | null> {
  "use cache";
  cacheLife("hours");
  const db = getDb();
  const [s] = await db.select().from(sponsors).where(eq(sponsors.id, id)).limit(1);
  if (!s) return null;
  const rows = await db
    .select(listColumns)
    .from(jobs)
    .where(and(eq(jobs.sponsorId, id), isOpen, ne(jobs.sponsorability, "ineligible")))
    .orderBy(badgeRank, desc(jobs.firstSeenAt))
    .limit(100);
  return {
    id: s.id,
    name: s.name,
    town: s.town,
    county: s.county,
    rating: s.workerRating,
    routes: s.routes,
    status: s.status,
    sector: s.sector,
    firstSeenOn: s.firstSeenOn,
    jobs: rows.map(toItem),
  };
}

export async function topSponsorIds(limit = 30): Promise<{ id: number; name: string }[]> {
  "use cache";
  cacheLife("hours");
  return getDb()
    .select({ id: sponsors.id, name: sponsors.name })
    .from(sponsors)
    .innerJoin(jobs, and(eq(jobs.sponsorId, sponsors.id), isOpen))
    .groupBy(sponsors.id, sponsors.name)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}

/**
 * Junior and non-training doctors' grades. GP posts (qualified GPs) and consultants
 * aren't junior roles, so they're left out even though they're doctors.
 */
const JUNIOR_DOCTOR_TITLE = String.raw`\m(foundation|fy ?[12]|f[12]|clinical fellow|junior|trust (grade|doctor)|sho|senior house officer|core trainee|ct[1-3]|specialty doctor|speciality doctor|staff grade|resident doctor|clinical research fellow|teaching fellow)\M`;

/** Junior doctors' posts on NHS Jobs that aren't ruled out. */
export async function doctorJobs(): Promise<JobListItem[]> {
  "use cache";
  cacheLife("hours");
  const rows = await getDb()
    .select(listColumns)
    .from(jobs)
    .innerJoin(jobSources, eq(jobSources.id, jobs.sourceId))
    .where(
      and(
        isOpen,
        eq(jobSources.ats, "nhs_jobs"),
        eq(jobs.socCode, "2211"),
        sql`${jobs.title} ~* ${JUNIOR_DOCTOR_TITLE}`,
        ne(jobs.sponsorability, "ineligible"),
        ne(jobs.seniority, "senior"),
      ),
    )
    .orderBy(badgeRank, desc(jobs.firstSeenAt))
    .limit(60);
  return rows.map(toItem);
}

export async function siteStats(): Promise<{ jobs: number; sponsors: number; updatedAt: string | null }> {
  "use cache";
  cacheLife("minutes");
  const [row] = await getDb()
    .select({
      jobs: sql<number>`count(*)::int`,
      sponsors: sql<number>`count(distinct ${jobs.sponsorId})::int`,
      updatedAt: sql<string | null>`max(${jobs.lastSeenAt})::text`,
    })
    .from(jobs)
    .where(isOpen);
  return row;
}

/**
 * How graduate-friendly a role looks: graduate, entry and junior roles first; then roles
 * with no stated level that pay under £70k (or don't say), then the rest.
 */
const graduateTier = sql`case when ${jobs.seniority} in ('graduate','entry','junior') then 0 when ${jobs.salaryAnnualMin} is null or ${jobs.salaryAnnualMin} < 70000 then 1 else 2 end`;

/**
 * The posting helper's candidates: jobs added in the last `days` that pass the check,
 * aren't manager-level or senior and aren't about to close, best first within each field
 * (up to 40 each).
 */
export async function postCandidates(days: number): Promise<JobListItem[]> {
  "use cache";
  cacheLife("minutes");
  const db = getDb();
  const ranked = db
    .select({
      ...listColumns,
      rank: sql<number>`row_number() over (partition by ${jobs.field} order by ${graduateTier}, ${badgeRank}, ${jobs.isGradScheme} desc, (${jobs.salaryAnnualMin} is not null) desc, ${jobs.firstSeenAt} desc)`.as("rank"),
    })
    .from(jobs)
    .where(
      and(
        isOpen,
        inArray(jobs.sponsorability, ["sponsorship_mentioned", "likely_eligible"]),
        notInArray(jobs.seniority, ["mid", "senior"]),
        isNotNull(jobs.field),
        ne(jobs.field, "other"),
        gte(jobs.firstSeenAt, sql`now() - make_interval(days => ${days})`),
        or(isNull(jobs.closingDate), gte(jobs.closingDate, sql`current_date + 2`)),
      ),
    )
    .as("ranked");
  // Select the job columns back out of the subquery, leaving the rank behind.
  const columns = Object.fromEntries(Object.keys(listColumns).map((k) => [k, ranked[k as keyof typeof listColumns]])) as {
    [K in keyof typeof listColumns]: (typeof ranked)[K];
  };
  const rows = await db.select(columns).from(ranked).where(lte(ranked.rank, 40)).orderBy(ranked.rank);
  return rows.map(toItem);
}

/** Apply clicks per channel (utm_source) over the last `days`. */
export async function clicksByChannel(days: number): Promise<{ source: string; clicks: number }[]> {
  const rows = await getDb()
    .select({ source: clicks.utmSource, clicks: sql<number>`count(*)::int` })
    .from(clicks)
    .where(gte(clicks.createdAt, sql`now() - make_interval(days => ${days})`))
    .groupBy(clicks.utmSource)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ source: r.source ?? "direct", clicks: r.clicks }));
}

/** Everything the sitemap lists: live jobs that aren't ruled out, and sponsors with live jobs. */
export async function sitemapEntries(): Promise<{
  jobs: { slug: string; updatedAt: string }[];
  sponsors: { id: number; name: string; updatedAt: string }[];
}> {
  "use cache";
  cacheLife("hours");
  const db = getDb();
  const [jobRows, sponsorRows] = await Promise.all([
    db
      .select({ slug: jobs.slug, updatedAt: jobs.updatedAt })
      .from(jobs)
      .where(and(isOpen, ne(jobs.sponsorability, "ineligible")))
      .orderBy(desc(jobs.firstSeenAt))
      .limit(45_000),
    db
      .select({ id: sponsors.id, name: sponsors.name, updatedAt: sql<string>`max(${jobs.updatedAt})::text` })
      .from(sponsors)
      .innerJoin(jobs, and(eq(jobs.sponsorId, sponsors.id), isOpen))
      .groupBy(sponsors.id, sponsors.name),
  ]);
  return {
    jobs: jobRows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() })),
    sponsors: sponsorRows.map((r) => ({ id: r.id, name: r.name, updatedAt: new Date(r.updatedAt).toISOString() })),
  };
}
