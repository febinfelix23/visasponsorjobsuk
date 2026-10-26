CREATE TYPE "alert_mode" AS ENUM('instant', 'daily');--> statement-breakpoint
CREATE TYPE "alert_view" AS ENUM('degree', 'experience', 'both');--> statement-breakpoint
CREATE TYPE "degree_level" AS ENUM('bachelors', 'masters', 'mba', 'phd', 'medicine', 'other');--> statement-breakpoint
CREATE TYPE "visa_type" AS ENUM('student', 'graduate', 'other');--> statement-breakpoint
CREATE TABLE "user_experience" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_experience_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"employer" text,
	"started_on" date,
	"ended_on" date,
	"soc_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_experience" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY,
	"degree_level" "degree_level",
	"subjects" text[] DEFAULT '{}'::text[] NOT NULL,
	"university" text,
	"graduation_year" smallint,
	"visa_type" "visa_type",
	"visa_expiry" date,
	"locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"remote_ok" boolean DEFAULT true NOT NULL,
	"alert_mode" "alert_mode" DEFAULT 'instant'::"alert_mode" NOT NULL,
	"alert_view" "alert_view" DEFAULT 'degree'::"alert_view" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "user_experience_user_id_idx" ON "user_experience" ("user_id");--> statement-breakpoint
ALTER TABLE "user_experience" ADD CONSTRAINT "user_experience_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;