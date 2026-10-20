ALTER TYPE "source_status" ADD VALUE 'unverified' BEFORE 'failing';--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "discovery" jsonb;--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "ats_probed_at" timestamp with time zone;