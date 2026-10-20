CREATE TYPE "sector_source" AS ENUM('nhs_name', 'sic', 'name_keyword', 'manual');--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "sector_source" "sector_source";--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "size_band" smallint DEFAULT 0 NOT NULL;