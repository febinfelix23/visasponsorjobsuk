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
  real,
  smallint,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Every table has RLS enabled with no policies, so nothing is reachable through
// the Supabase Data API. The app and scripts connect as `postgres`, which
// bypasses RLS.

export const sponsorStatus = pgEnum("sponsor_status", ["active", "removed"]);
export const sector = pgEnum("sector", ["tech", "finance", "engineering", "healthcare", "other"]);
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
export const sourceStatus = pgEnum("source_status", ["active", "failing", "disabled"]);
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
    inScope: boolean().notNull().default(false),
    sicCodes: text().array(),
    companyNumber: text(),
    domain: text(),
    matchConfidence: real(),
    priorityScore: real().notNull().default(0),
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
    sector: sector(),
    seniority: seniority().notNull().default("unknown"),
    isGradScheme: boolean().notNull().default(false),
    socCode: text(),
    sponsorability: sponsorability().notNull().default("unknown"),
    reasons: jsonb().$type<SponsorabilityReason[]>().notNull().default([]),
    snippet: text(),
    applyUrl: text().notNull(),
    postedAt: timestamp({ withTimezone: true }),
    closingDate: date({ mode: "string" }),
    status: jobStatus().notNull().default("live"),
    /** Crawls in a row where the source no longer listed this job; expired at 2. */
    missedCrawls: smallint().notNull().default(0),
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
