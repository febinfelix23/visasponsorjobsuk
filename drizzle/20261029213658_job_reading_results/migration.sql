ALTER TABLE "jobs" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "experience_level" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "experience_min_years" smallint;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "meets_new_entrant_rate" boolean;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "meets_general_rate" boolean;