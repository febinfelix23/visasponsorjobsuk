# Build plan: strict job checks

Design: [2026-10-28-strict-job-checks-design.md](../specs/2026-10-28-strict-job-checks-design.md). Each task is test-first (failing test, then code, then the full suite), and each stage ends with verification before a commit request. The founder commits; nothing reaches `main` until stage 6.

## Stage 1: Scraping (whole ad, working pattern, freshness)

1. **NHS advert parser** (`src/lib/scrape/adapters/nhs-jobs.ts`)
   - Tests on invented HTML with the live page's structure: sections joined under their headings, mobile/desktop duplicates dropped, working pattern read from the paragraph after `#working_pattern_heading`, Person Specification included, the CoS section kept.
   - `RawJob` gains `workingPattern`; `jobs` gains `working_pattern`.
2. **Detail versions** (replaces the `LEGACY_CUT_LENGTH` trick from the held fixes)
   - `jobs.detail_version` integer; `DETAIL_VERSION` per adapter. The pipeline's "known" set only counts jobs at the current version, so changed parsers re-fetch once.
   - Description cap 20,000 characters, start and end kept.
3. **Scheduling window**: sources due within the next 3 hours are crawled; NHS recrawl interval 12 hours.
4. **NHS expiry check**: live NHS jobs missing from a complete crawl get their advert fetched (capped per run); gone or closed expires at once. Test on invented closed/open pages after checking what a real closed advert returns.

## Stage 2: The reader

5. **Quote check** (`src/lib/reading/quotes.ts`): normaliser and verifier, tests first (case, whitespace, curly quotes, dashes, bullets; invented quotes rejected).
6. **Reading schema and parser** (`src/lib/reading/schema.ts`): facts from §5.3 with enums; parse and verify a model response into facts, dropping unverified ones (a failed `not_offered` quote is kept as a flag).
7. **Reader client** (`src/lib/reading/read-job.ts`): Haiku 5.5, medium effort, JSON schema, cached system prompt with the occupation list; cost accounting.
8. **`job_readings` table + `scripts/read-jobs.ts`**: reads jobs without a reading for their current description hash; per-run cap 3,000, monthly cap $15; run-report section incl. "waiting to be read" and >12h waits under "Needs attention". Workflow step replaces `classify:jobs`.
9. **Trial**: 100 ads, cost and a look at the facts, before any backfill.

## Stage 3: Rules

10. **Stamp rules** (`score.ts`) from facts + phrase rules + register + salary tables, in the §5.4 order; two salary checks; experience label; unread → not listable. Tests per rule from the real failures (sentences only, no full ads in the repo).
11. **Score script** reads `job_readings`; new `jobs` columns (`experience_level`, `experience_min_years`, `meets_new_entrant_rate`, `meets_general_rate`, `read_at`); closing date filled from the reading.

## Stage 4: Accuracy and shadow

12. **Labelled set** in `reading_labels` (about 200 live ads, stratified: NHS ticked box, explicit no, part-time, bank/locum, silent tech ads). Founder spot-checks 30.
13. **`npm run eval:reader`**: gate at ≥98% "no sponsorship" recall and ≥95% contract and hours. Backfill all live ads (about $6).
14. **Shadow diff**: new stamps computed beside the live ones; before/after counts and samples to Telegram.

## Stage 5: Site

15. Listings, sponsor pages, sitemap and posting helper exclude unread jobs; job page "This job is being checked" + `noindex`.
16. Checklist rows (contract, hours, both salary checks, experience, quotes); "Sponsorship offered" label; "Meets the general rate" tag; "Graduate and entry level only" filter; `/how-we-check` rewrite. Reads the Next.js 16 docs in `node_modules/next/dist/docs/` first.
17. Blueprint updates (§0 audience, §2.2, §2.3, §3.5, §4.3).

## Stage 6: Switch

18. Bump `SCORE_VERSION`, retire `classify-jobs`, merge to `main`, watch the first two runs' reports.
