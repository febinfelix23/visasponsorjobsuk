import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  primaryKey,
  real,
  smallint,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
// Referenced for foreign keys only; never exported, so drizzle-kit leaves the auth schema alone.
import { authUsers } from "drizzle-orm/supabase";

// Every table has RLS enabled with no policies, so nothing is reachable through
// the Supabase Data API. The app and scripts connect as `postgres`, which
// bypasses RLS.

export const sponsorStatus = pgEnum("sponsor_status", ["active", "removed"]);
export const sector = pgEnum("sector", ["tech", "finance", "engineering", "healthcare", "other"]);
export const sectorSource = pgEnum("sector_source", ["nhs_name", "known_employer", "sic", "name_keyword", "manual"]);
export const sponsorEventType = pgEnum("sponsor_event_type", [
  "added",
  "removed",
  "readded",
  "rating_changed",
  "routes_changed",
]);
export const atsType = pgEnum("ats_type", [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "workday",
  "nhs_jobs",
]);
/** "unverified": found by slug probing but not yet confirmed to belong to the sponsor. */
export const sourceStatus = pgEnum("source_status", ["active", "unverified", "failing", "disabled"]);
export const jobStatus = pgEnum("job_status", ["live", "expired"]);
export const seniority = pgEnum("seniority", ["graduate", "entry", "junior", "mid", "senior", "unknown"]);
export const sponsorability = pgEnum("sponsorability", [
  "sponsorship_mentioned",
  "likely_eligible",
  "check_with_employer",
  "ineligible",
  "unknown",
]);
export const salaryPeriod = pgEnum("salary_period", ["year", "month", "week", "day", "hour"]);
export const runKind = pgEnum("run_kind", ["register_ingest", "sector_tagging", "ats_discovery", "scrape"]);
export const runStatus = pgEnum("run_status", ["running", "succeeded", "failed", "skipped"]);

const id = () => bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** One row per organisation + town on the gov.uk Register of Licensed Sponsors. */
export const sponsors = snakeCase.table.withRLS(
  "sponsors",
  {
    id: id(),
    /** lower(name)|lower(town): the register has no stable ID, so this is our natural key. */
    registerKey: text().notNull(),
    name: text().notNull(),
    nameNormalised: text().notNull(),
    tradingName: text(),
    town: text().notNull(),
    county: text(),
    workerRating: text(),
    temporaryWorkerRating: text(),
    routes: text().array().notNull().default(sql`'{}'::text[]`),
    isSkilledWorker: boolean().notNull().default(false),
    status: sponsorStatus().notNull().default("active"),
    firstSeenOn: date({ mode: "string" }).notNull(),
    removedOn: date({ mode: "string" }),
    // Enrichment (Phase 0.3+)
    sector: sector(),
    /** How the sector was decided. "manual" rows are never overwritten by the tagging job. */
    sectorSource: sectorSource(),
    inScope: boolean().notNull().default(false),
    sicCodes: text().array(),
    /** 0 = micro/unknown … 3 = large, from the Companies House accounts category. */
    sizeBand: smallint().notNull().default(0),
    companyNumber: text(),
    domain: text(),
    matchConfidence: real(),
    priorityScore: real().notNull().default(0),
    /** Last time ATS discovery probed this sponsor's slugs (Phase 0.4). */
    atsProbedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sponsors_register_key_idx").on(t.registerKey),
    index("sponsors_name_normalised_idx").on(t.nameNormalised),
    index("sponsors_crawl_priority_idx")
      .on(t.priorityScore.desc())
      .where(sql`${t.inScope} and ${t.status} = 'active'`),
  ],
);

/** One row per distinct register CSV we have ingested. */
export const registerSnapshots = snakeCase.table.withRLS(
  "register_snapshots",
  {
    id: id(),
    fileUrl: text().notNull(),
    fileHash: text().notNull(),
    publishedOn: date({ mode: "string" }).notNull(),
    rowCount: integer().notNull(),
    sponsorCount: integer().notNull(),
    addedCount: integer().notNull().default(0),
    removedCount: integer().notNull().default(0),
    changedCount: integer().notNull().default(0),
    ingestedAt: createdAt(),
  },
  (t) => [uniqueIndex("register_snapshots_file_hash_idx").on(t.fileHash)],
);

/** Licence history: new sponsors, removals, rating downgrades. */
export const sponsorEvents = snakeCase.table.withRLS(
  "sponsor_events",
  {
    id: id(),
    sponsorId: bigint({ mode: "number" })
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    snapshotId: bigint({ mode: "number" })
      .notNull()
      .references(() => registerSnapshots.id, { onDelete: "cascade" }),
    type: sponsorEventType().notNull(),
    details: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("sponsor_events_sponsor_id_idx").on(t.sponsorId),
    index("sponsor_events_snapshot_id_idx").on(t.snapshotId),
    index("sponsor_events_type_created_at_idx").on(t.type, t.createdAt.desc()),
  ],
);

/** A place we fetch jobs from: an ATS board for a sponsor, or a shared board like NHS Jobs. */
export const jobSources = snakeCase.table.withRLS(
  "job_sources",
  {
    id: id(),
    /** Null for shared boards (NHS Jobs), where jobs are matched to sponsors individually. */
    sponsorId: bigint({ mode: "number" }).references(() => sponsors.id, { onDelete: "cascade" }),
    ats: atsType().notNull(),
    /** Board slug, Workday tenant path, etc. */
    identifier: text().notNull(),
    careersUrl: text(),
    status: sourceStatus().notNull().default("active"),
    /** How the source was found: slug tried, board name, verification method. */
    discovery: jsonb().$type<Record<string, unknown>>(),
    consecutiveFailures: smallint().notNull().default(0),
    lastError: text(),
    lastCrawledAt: timestamp({ withTimezone: true }),
    nextCrawlAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastJobCount: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("job_sources_ats_identifier_idx").on(t.ats, t.identifier),
    index("job_sources_sponsor_id_idx").on(t.sponsorId),
    index("job_sources_next_crawl_at_idx")
      .on(t.nextCrawlAt)
      .where(sql`${t.status} <> 'disabled'`),
  ],
);

export type SponsorabilityReason = { code: string; message: string };

export const jobs = snakeCase.table.withRLS(
  "jobs",
  {
    id: id(),
    sourceId: bigint({ mode: "number" })
      .notNull()
      .references(() => jobSources.id, { onDelete: "cascade" }),
    sponsorId: bigint({ mode: "number" }).references(() => sponsors.id, { onDelete: "set null" }),
    externalId: text().notNull(),
    slug: text().notNull(),
    title: text().notNull(),
    employerName: text().notNull(),
    locationText: text(),
    city: text(),
    region: text(),
    isRemote: boolean().notNull().default(false),
    salaryMin: numeric({ precision: 10, scale: 2, mode: "number" }),
    salaryMax: numeric({ precision: 10, scale: 2, mode: "number" }),
    salaryPeriod: salaryPeriod(),
    /** Salary converted to a full-time annual figure, for the salary filter and the visa rule. */
    salaryAnnualMin: numeric({ precision: 10, scale: 2, mode: "number" }),
    salaryAnnualMax: numeric({ precision: 10, scale: 2, mode: "number" }),
    /** The employer's industry (from the sponsor), copied at scrape time. */
    sector: sector(),
    /**
     * Field of work (src/lib/scoring/fields.ts), independent of the employer: "Software Engineer"
     * at a bank is "software". Plain text so new fields don't need a migration. Drives the filters.
     */
    field: text(),
    seniority: seniority().notNull().default("unknown"),
    isGradScheme: boolean().notNull().default(false),
    socCode: text(),
    sponsorability: sponsorability().notNull().default("unknown"),
    reasons: jsonb().$type<SponsorabilityReason[]>().notNull().default([]),
    /** Scoring rules version (src/lib/scoring/score.ts); jobs scored by an older version are re-scored. */
    scoreVersion: smallint(),
    scoredAt: timestamp({ withTimezone: true }),
    snippet: text(),
    /**
     * Plain-text description, capped in length. Used only to score the job (sponsorship
     * wording, seniority, occupation); never shown on the site, which links to the original ad.
     */
    description: text(),
    /** Salary exactly as advertised, before parsing ("£45,000 - £55,000 per annum"). */
    salaryText: text(),
    employmentType: text(),
    department: text(),
    applyUrl: text().notNull(),
    postedAt: timestamp({ withTimezone: true }),
    closingDate: date({ mode: "string" }),
    status: jobStatus().notNull().default("live"),
    /** Crawls in a row where the source no longer listed this job; expired at 2. */
    missedCrawls: smallint().notNull().default(0),
    /** Which version of the adapter's detail parser produced the description (see DETAIL_VERSION). */
    detailVersion: smallint().notNull().default(1),
    contentHash: text(),
    firstSeenAt: createdAt(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("jobs_source_external_id_idx").on(t.sourceId, t.externalId),
    uniqueIndex("jobs_slug_idx").on(t.slug),
    index("jobs_sponsor_id_idx").on(t.sponsorId),
    index("jobs_live_listing_idx")
      .on(t.sector, t.firstSeenAt.desc())
      .where(sql`${t.status} = 'live'`),
    index("jobs_live_field_idx")
      .on(t.field, t.firstSeenAt.desc())
      .where(sql`${t.status} = 'live'`),
    index("jobs_live_sponsorability_idx")
      .on(t.sponsorability, t.seniority)
      .where(sql`${t.status} = 'live'`),
  ],
);

export const crawlRuns = snakeCase.table.withRLS(
  "crawl_runs",
  {
    id: id(),
    kind: runKind().notNull(),
    status: runStatus().notNull().default("running"),
    startedAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
    stats: jsonb().$type<Record<string, unknown>>(),
    error: text(),
  },
  (t) => [index("crawl_runs_kind_started_at_idx").on(t.kind, t.startedAt.desc())],
);

/** Outbound apply clicks. No IPs or user agents are stored. */
export const clicks = snakeCase.table.withRLS(
  "clicks",
  {
    id: id(),
    jobId: bigint({ mode: "number" })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("clicks_job_id_idx").on(t.jobId),
    index("clicks_created_at_idx").on(t.createdAt),
  ],
);

/**
 * AI classification of a job title, cached so each distinct title (in the context of
 * the employer's industry) is only classified once.
 */
export const jobClassifications = snakeCase.table.withRLS("job_classifications", {
  /** "v2|" + normalised title + "|" + employer (older rows: title + "|" + employer industry). */
  key: text().primaryKey(),
  title: text().notNull(),
  employerIndustry: text(),
  /** SOC 2020 code, only ever one from the official Skilled Occupations table, or null. */
  socCode: text(),
  field: text(),
  model: text().notNull(),
  createdAt: createdAt(),
});

// ── Job seekers' accounts (premium §13). Rows belong to a Supabase Auth user and are
// deleted with it (on delete cascade), so deleting an account removes everything here.

export const degreeLevel = pgEnum("degree_level", ["bachelors", "masters", "mba", "phd", "medicine", "other"]);
export const visaType = pgEnum("visa_type", ["student", "graduate", "other"]);
export const alertMode = pgEnum("alert_mode", ["instant", "daily"]);
export const alertView = pgEnum("alert_view", ["degree", "experience", "both"]);

export const experienceKind = pgEnum("experience_kind", ["job", "internship", "placement", "volunteering"]);

/** Job preferences and alert settings: one row per user. Degrees and experience have their own tables. */
export const userProfiles = snakeCase.table.withRLS("user_profiles", {
  userId: uuid()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  /** Optional, used only for "closing soon" urgency, never for advice. */
  visaType: visaType(),
  visaExpiry: date({ mode: "string" }),
  /** Towns or regions the user wants to work in; empty means anywhere in the UK. */
  locations: text().array().notNull().default(sql`'{}'::text[]`),
  remoteOk: boolean().notNull().default(true),
  alertMode: alertMode().notNull().default("instant"),
  alertView: alertView().notNull().default("degree"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A user's degrees; matching uses every subject across them. */
export const userEducation = snakeCase.table.withRLS(
  "user_education",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    level: degreeLevel().notNull(),
    /** CAH level 3 codes (src/lib/profile/cah-subjects.json); joint honours have two. */
    subjects: text().array().notNull(),
    university: text(),
    /** The year it was or will be completed. */
    graduationYear: smallint().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("user_education_user_id_idx").on(t.userId)],
);

export const userExperience = snakeCase.table.withRLS(
  "user_experience",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: text().notNull(),
    employer: text(),
    kind: experienceKind().notNull().default("job"),
    /** First of the month. */
    startedOn: date({ mode: "string" }),
    /** Null while it's the current job. */
    endedOn: date({ mode: "string" }),
    /** SOC 2020 code for the title, from the job classifier (step D). */
    socCode: text(),
    createdAt: createdAt(),
  },
  (t) => [index("user_experience_user_id_idx").on(t.userId)],
);

export const applicationStatus = pgEnum("application_status", ["saved", "applied", "interview", "offer", "rejected"]);

/** Jobs a user has saved, with where their application stands. Kept after a job closes, so the history stays. */
export const savedJobs = snakeCase.table.withRLS(
  "saved_jobs",
  {
    userId: uuid()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    jobId: bigint({ mode: "number" })
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: applicationStatus().notNull().default("saved"),
    savedAt: createdAt(),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] }), index("saved_jobs_user_id_idx").on(t.userId, t.status)],
);
