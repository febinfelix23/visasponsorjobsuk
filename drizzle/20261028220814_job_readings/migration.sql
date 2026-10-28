CREATE TABLE "job_readings" (
	"job_id" bigint,
	"text_hash" text,
	"model" text NOT NULL,
	"facts" jsonb NOT NULL,
	"cost_usd" numeric(10,6) NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_readings_pkey" PRIMARY KEY("job_id","text_hash")
);
--> statement-breakpoint
ALTER TABLE "job_readings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "job_readings_read_at_idx" ON "job_readings" ("read_at");--> statement-breakpoint
ALTER TABLE "job_readings" ADD CONSTRAINT "job_readings_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;