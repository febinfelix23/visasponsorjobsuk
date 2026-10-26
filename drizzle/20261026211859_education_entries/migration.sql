CREATE TYPE "experience_kind" AS ENUM('job', 'internship', 'placement', 'volunteering');--> statement-breakpoint
CREATE TABLE "user_education" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_education_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"level" "degree_level" NOT NULL,
	"subjects" text[] NOT NULL,
	"university" text,
	"graduation_year" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_education" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_experience" ADD COLUMN "kind" "experience_kind" DEFAULT 'job'::"experience_kind" NOT NULL;--> statement-breakpoint
-- Keep any degree already saved on a profile: copy it into user_education before the columns go.
INSERT INTO "user_education" ("user_id", "level", "subjects", "university", "graduation_year")
SELECT "user_id", "degree_level", "subjects", "university", "graduation_year"
FROM "user_profiles"
WHERE "degree_level" IS NOT NULL AND cardinality("subjects") > 0 AND "graduation_year" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "degree_level";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "subjects";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "university";--> statement-breakpoint
ALTER TABLE "user_profiles" DROP COLUMN "graduation_year";--> statement-breakpoint
CREATE INDEX "user_education_user_id_idx" ON "user_education" ("user_id");--> statement-breakpoint
ALTER TABLE "user_education" ADD CONSTRAINT "user_education_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;