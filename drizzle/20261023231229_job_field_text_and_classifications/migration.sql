CREATE TABLE "job_classifications" (
	"key" text PRIMARY KEY,
	"title" text NOT NULL,
	"employer_industry" text,
	"soc_code" text,
	"field" text,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_classifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "field" SET DATA TYPE text USING "field"::text;