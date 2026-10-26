CREATE TYPE "application_status" AS ENUM('saved', 'applied', 'interview', 'offer', 'rejected');--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"user_id" uuid,
	"job_id" bigint,
	"status" "application_status" DEFAULT 'saved'::"application_status" NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_jobs_pkey" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "saved_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "saved_jobs_user_id_idx" ON "saved_jobs" ("user_id","status");--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;