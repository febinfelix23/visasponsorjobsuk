ALTER TABLE "jobs" ADD COLUMN "field" "sector";--> statement-breakpoint
CREATE INDEX "jobs_live_field_idx" ON "jobs" ("field","first_seen_at" DESC NULLS LAST) WHERE "status" = 'live';