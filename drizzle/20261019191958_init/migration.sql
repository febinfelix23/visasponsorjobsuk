CREATE TYPE "ats_type" AS ENUM('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'workday', 'nhs_jobs');--> statement-breakpoint
CREATE TYPE "job_status" AS ENUM('live', 'expired');--> statement-breakpoint
CREATE TYPE "run_kind" AS ENUM('register_ingest', 'sector_tagging', 'ats_discovery', 'scrape');--> statement-breakpoint
CREATE TYPE "run_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "salary_period" AS ENUM('year', 'month', 'week', 'day', 'hour');--> statement-breakpoint
CREATE TYPE "sector" AS ENUM('tech', 'finance', 'engineering', 'healthcare', 'other');--> statement-breakpoint
CREATE TYPE "seniority" AS ENUM('graduate', 'entry', 'junior', 'mid', 'senior', 'unknown');--> statement-breakpoint
CREATE TYPE "source_status" AS ENUM('active', 'failing', 'disabled');--> statement-breakpoint
CREATE TYPE "sponsor_event_type" AS ENUM('added', 'removed', 'readded', 'rating_changed', 'routes_changed');--> statement-breakpoint
CREATE TYPE "sponsor_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "sponsorability" AS ENUM('sponsorship_mentioned', 'likely_eligible', 'check_with_employer', 'ineligible', 'unknown');--> statement-breakpoint
CREATE TABLE "clicks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clicks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_id" bigint NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clicks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crawl_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crawl_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "run_kind" NOT NULL,
	"status" "run_status" DEFAULT 'running'::"run_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "crawl_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_sources" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sponsor_id" bigint,
	"ats" "ats_type" NOT NULL,
	"identifier" text NOT NULL,
	"careers_url" text,
	"status" "source_status" DEFAULT 'active'::"source_status" NOT NULL,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_crawled_at" timestamp with time zone,
	"next_crawl_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_job_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_id" bigint NOT NULL,
	"sponsor_id" bigint,
	"external_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"employer_name" text NOT NULL,
	"location_text" text,
	"city" text,
	"region" text,
	"is_remote" boolean DEFAULT false NOT NULL,
	"salary_min" numeric(10,2),
	"salary_max" numeric(10,2),
	"salary_period" "salary_period",
	"sector" "sector",
	"seniority" "seniority" DEFAULT 'unknown'::"seniority" NOT NULL,
	"is_grad_scheme" boolean DEFAULT false NOT NULL,
	"soc_code" text,
	"sponsorability" "sponsorability" DEFAULT 'unknown'::"sponsorability" NOT NULL,
	"reasons" jsonb DEFAULT '[]' NOT NULL,
	"snippet" text,
	"apply_url" text NOT NULL,
	"posted_at" timestamp with time zone,
	"closing_date" date,
	"status" "job_status" DEFAULT 'live'::"job_status" NOT NULL,
	"missed_crawls" smallint DEFAULT 0 NOT NULL,
	"content_hash" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "register_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "register_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"file_url" text NOT NULL,
	"file_hash" text NOT NULL,
	"published_on" date NOT NULL,
	"row_count" integer NOT NULL,
	"sponsor_count" integer NOT NULL,
	"added_count" integer DEFAULT 0 NOT NULL,
	"removed_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "register_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sponsor_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sponsor_id" bigint NOT NULL,
	"snapshot_id" bigint NOT NULL,
	"type" "sponsor_event_type" NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sponsor_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sponsors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"register_key" text NOT NULL,
	"name" text NOT NULL,
	"name_normalised" text NOT NULL,
	"trading_name" text,
	"town" text NOT NULL,
	"county" text,
	"worker_rating" text,
	"temporary_worker_rating" text,
	"routes" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_skilled_worker" boolean DEFAULT false NOT NULL,
	"status" "sponsor_status" DEFAULT 'active'::"sponsor_status" NOT NULL,
	"first_seen_on" date NOT NULL,
	"removed_on" date,
	"sector" "sector",
	"in_scope" boolean DEFAULT false NOT NULL,
	"sic_codes" text[],
	"company_number" text,
	"domain" text,
	"match_confidence" real,
	"priority_score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sponsors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "clicks_job_id_idx" ON "clicks" ("job_id");--> statement-breakpoint
CREATE INDEX "clicks_created_at_idx" ON "clicks" ("created_at");--> statement-breakpoint
CREATE INDEX "crawl_runs_kind_started_at_idx" ON "crawl_runs" ("kind","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "job_sources_ats_identifier_idx" ON "job_sources" ("ats","identifier");--> statement-breakpoint
CREATE INDEX "job_sources_sponsor_id_idx" ON "job_sources" ("sponsor_id");--> statement-breakpoint
CREATE INDEX "job_sources_next_crawl_at_idx" ON "job_sources" ("next_crawl_at") WHERE "status" <> 'disabled';--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_source_external_id_idx" ON "jobs" ("source_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_slug_idx" ON "jobs" ("slug");--> statement-breakpoint
CREATE INDEX "jobs_sponsor_id_idx" ON "jobs" ("sponsor_id");--> statement-breakpoint
CREATE INDEX "jobs_live_listing_idx" ON "jobs" ("sector","first_seen_at" DESC NULLS LAST) WHERE "status" = 'live';--> statement-breakpoint
CREATE UNIQUE INDEX "register_snapshots_file_hash_idx" ON "register_snapshots" ("file_hash");--> statement-breakpoint
CREATE INDEX "sponsor_events_sponsor_id_idx" ON "sponsor_events" ("sponsor_id");--> statement-breakpoint
CREATE INDEX "sponsor_events_snapshot_id_idx" ON "sponsor_events" ("snapshot_id");--> statement-breakpoint
CREATE INDEX "sponsor_events_type_created_at_idx" ON "sponsor_events" ("type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sponsors_register_key_idx" ON "sponsors" ("register_key");--> statement-breakpoint
CREATE INDEX "sponsors_name_normalised_idx" ON "sponsors" ("name_normalised");--> statement-breakpoint
CREATE INDEX "sponsors_crawl_priority_idx" ON "sponsors" ("priority_score" DESC NULLS LAST) WHERE "in_scope" and "status" = 'active';--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_sponsor_id_sponsors_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_id_job_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "job_sources"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_sponsor_id_sponsors_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sponsor_events" ADD CONSTRAINT "sponsor_events_sponsor_id_sponsors_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sponsor_events" ADD CONSTRAINT "sponsor_events_snapshot_id_register_snapshots_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "register_snapshots"("id") ON DELETE CASCADE;