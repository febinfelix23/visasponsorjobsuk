ALTER TABLE "jobs" ADD COLUMN "salary_annual_min" numeric(10,2);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_annual_max" numeric(10,2);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "score_version" smallint;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "scored_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "jobs_live_sponsorability_idx" ON "jobs" ("sponsorability","seniority") WHERE "status" = 'live';