# Strict job checks: whole-ad reading and tighter sponsorship stamps

_Date: 2026-10-28 · Status: approved by the founder 2026-10-28 · Replaces the uncommitted scoring fixes of 2026-10-28 (they are kept as the starting point, see §9)_

## 1. Intent

The site exists to list jobs that can lead to Skilled Worker sponsorship. A job wrongly stamped green costs a user an application and costs the site its trust. Today's stamps come from phrase rules over a partial copy of each ad, and they fail in ways users notice:

- Ads that say **"VISA SPONSORSHIP DOES NOT APPLY TO THIS ROLE"** show **"Ad mentions sponsorship"**, because the NHS Jobs sponsorship box was ticked and the "no" wording isn't in the phrase list. A scan of all live ads found **156 "no" sentences the latest rules still miss**, some stamped *Likely eligible*.
- **Part-time posts show as eligible**: the NHS adapter has never read the working pattern (it looks for `id="working_pattern"`, which the page doesn't have), and hours in the ad text are never read.
- **Closed jobs linger**: NHS is re-crawled every 24 hours counted from the last crawl, scheduled runs start hours late, so NHS is often skipped for a run; expiry also needs two misses. Non-NHS boards supply no closing date, so deadlines written in the ad are ignored.
- **NHS ads are stored at about a third of their text**: the adapter keeps three sections and drops "About us", the Person Specification and the working pattern.

Adding more phrases has been tried three times; each round finds new wording. This design changes the approach: **read the whole ad once with AI, require a word-for-word quote for every fact, and let fixed rules decide the stamp.**

## 2. Audience (changed from the blueprint)

People **currently in the UK** who need Skilled Worker sponsorship for a new job: graduates switching from a Student or Graduate visa, and people already working in the UK who want a new sponsored job. **Not** people applying from overseas.

Consequences: every job gets **two salary checks** (§5.3), and the blueprint's "UK graduates only" locked decision, §1, §2.2 and §2.3 are updated to match.

## 3. Goals, non-goals, anti-goals

| Goals | Non-goals (v1) | Anti-goals (failure even if it "works") |
|---|---|---|
| Every live ad read in full, once per version of its text | Reading attached PDFs (NHS job-description documents) | A green stamp on an ad that says sponsorship isn't available |
| A green stamp only when every rule passes on stated facts | Overseas applicants' rules | A fact on the job page that isn't in the ad (made up by the AI) |
| Each stamp's reasons quote the ad's own words | Transitional salary rules (pre-April 2024 visa holders), PhD discounts, Immigration Salary List | Casual, part-time or short-contract work stamped green |
| Closed jobs leave the listings within about 12 hours | Employer-side features | Silent loss of good jobs without the run report saying so |
| Experience required shown on every job | Auto-publishing or advice of any kind | Immigration advice or promises in any text |

## 4. Decided by the founder (2026-10-28)

1. **Likely eligible stays**, with its own stamp: a licensed sponsor whose ad passes every rule but says nothing about sponsorship.
2. **Contracts accepted for green:** permanent, or fixed-term of **12 months or more**.
3. **AI cost accepted**: about $6 one-off, about $5–10 a month.
4. **Audience: people in the UK only** (§2).
5. **No interim release**: the uncommitted fixes are held and folded into this rebuild.
6. **NHS PDFs skipped** in v1.
7. From the original brief: **no bank, locum, sessional or zero-hours work as green; part-time never green; salary must be stated (or an NHS band) for green; any "no sponsorship" statement anywhere beats any "yes".**
8. **Unstated hours or contract don't block green** (decided 2026-10-28, §11): an ad that doesn't state them is treated as a normal full-time, permanent job, and the job page says so. Only stated part-time, casual, short or freelance work blocks green.
9. **Unread jobs are hidden** until read, not shown as "Check with employer" (§5.3).

## 5. How it works

### 5.1 Pipeline (each scrape run, GitHub Actions)

```
scrape (whole ad text) → read (AI, new or changed ads only) → decide (rules) → publish
```

`classify-jobs` (per-title occupation codes) is retired: the reader returns the occupation code as part of each reading.

### 5.2 Scraping changes

- **NHS Jobs adapter**
  - Store the whole advert as one text, each section under its heading, once: Job summary, Main duties, About us, Job responsibilities, Person Specification (essential and desirable criteria, including experience), Certificate of Sponsorship, UK registration, plus structured fields as labelled lines: band, salary, contract, working pattern, closing date. The page repeats sections for mobile and desktop; keep one copy.
  - Read the **working pattern** from the paragraph after `#working_pattern_heading` into its own field.
  - **Re-fetch every live NHS ad once** when the parse version changes: a `detail_version` integer on `jobs`; the adapter treats a known job with an older version as unseen. About 4,300 requests at the existing polite limits, about 25 minutes, spread over the normal runs.
- **All adapters:** raise the description cap from 8,000 to **20,000** characters (keeps start and end, as in the held fixes). Only about 10% of ads exceed 8,000; about 15 MB extra.
- **Scheduling:** a source counts as due if its `next_crawl_at` falls within the next **3 hours**, so late GitHub runs don't skip it. NHS keeps a 12-hour interval like the rest.
- **Expiry:**
  - NHS: when a live job is missing from a complete NHS crawl, fetch its advert page; if it's gone or says closed, expire it at once. Otherwise apply the two-miss rule.
  - Other boards: unchanged two-miss rule, now reliable at about 24 hours worst case because sources aren't skipped.
  - A closing date the reader finds in the ad text fills `jobs.closing_date` when the board gave none; listings already hide jobs past their closing date.

### 5.3 The reader (AI)

- **Model:** Claude Haiku 5.5, medium effort, JSON-schema output. One call per job, made when the job is new or its description hash changes. Results stored in a new `job_readings` table (job id, description hash, model, facts JSON, verified flag per fact, tokens, cost, read at).
- **Input:** title, employer, board-supplied fields (contract, working pattern, salary text, band), and the full description.
- **Output facts, each with a verbatim quote from the input or null:**

| Fact | Values |
|---|---|
| Sponsorship statement | `offered`, `offered_with_conditions`, `not_offered`, `not_offered_with_conditions`, `not_mentioned`, with every relevant quote (yes and no) |
| Contract | `permanent`, `fixed_term` (+ months), `bank`, `locum`, `sessional`, `zero_hours`, `temporary`, `contractor`, `self_employed`, `internship`, `apprenticeship`, `not_stated` |
| Hours | `full_time`, `part_time`, `full_or_part_time`, `not_stated`, plus hours a week or FTE when given |
| Salary | min, max, period, whether it's actual pay or full-time equivalent, "up to" only, location splits |
| Experience | `graduate_or_entry`, `some_experience`, `experienced`, `senior`, `not_stated`, plus minimum years when stated (Person Specification counts) |
| Closing date | date when stated |
| Occupation | SOC 2020 code from the official table, and field of work |

- **Quote check (code, not AI):** every quote must appear in the ad after normalising whitespace, case, apostrophes and dashes. A fact whose quote fails is treated as `not_stated`. A `not_offered` with a failed quote still blocks green: it becomes "Check with employer", never green.
- **Second opinion:** the existing phrase rules (`signals.ts`) still run. If either the reader or the rules find a decisive "no", the job is **not sponsorable**. Disagreements are counted in the run report.
- **Cost controls:** a per-run cap (3,000 readings) and a monthly cap in code ($15); usage and cost go in the Telegram run report.
- **Unread jobs are not listed** (decided 2026-10-28): until a job has a reading for its current text, it's left out of listings, sponsor pages, the sitemap and the posting helper. Its job page says "This job is being checked" and is `noindex`. The run report shows "N jobs waiting to be read", and any job waiting more than 12 hours goes under "Needs attention".
- **Rules first:** jobs whose phrase rules already find a decisive "no" are still read (the quote is useful on the page), but scraping order puts new jobs first.

### 5.4 Deciding the stamp (rules, `score.ts`)

Checked in this order; the first that applies decides.

1. **Not sponsorable** (hidden from listings by default)
   - sponsorship `not_offered` (reader) or a decisive "no" (phrase rules)
   - contract bank, locum, sessional, zero-hours, temporary, contractor, self-employed, internship or apprenticeship; fixed-term under 12 months
   - hours part-time (stated by the board or the ad)
   - salary below the **new-entrant** rate for the occupation
   - an ineligible occupation from the keyword rules (an AI-only ineligible code stays "Check", as today)
2. **Check with employer**
   - a quote failed on a "no"; sponsor not matched to the register, not on the Skilled Worker route, or not A-rated
   - `offered_with_conditions` or `not_offered_with_conditions`
   - salary not stated (and no NHS Band 5+ in a pay-scale occupation), only an "up to" figure, or a range that spans the rate
   - occupation limited, unknown, or AI-chosen ineligible; NHS band below 5
   - (hours or contract **not stated** does not send a job here; the checklist shows "Not stated in the ad")
3. **Sponsorship offered** (green; today's "Ad mentions sponsorship", relabelled): sponsorship `offered` with a verified quote, or the NHS sponsorship box ticked with no "no" anywhere, and nothing above applies.
4. **Likely eligible** (green): sponsorship `not_mentioned` and nothing above applies.

**Salary checks shown on every job** (facts only, rules date shown):
- *New-entrant rate*: higher of £33,400 and 70% of the going rate, from the gov.uk table (rules as of 11 Nov 2025). Applies to, for example, people switching from a Student or Graduate visa and people under 26.
- *General rate*: higher of £41,700 and the going rate.
- Green needs at least the new-entrant rate. The job page shows both results; listings show a small "Meets the general rate" tag when it does.
- NHS posts in pay-scale occupations at Band 5 or above meet both.

**Experience** is a label, not a stamp: "Graduate or entry level", "Experience: 2+ years", "Senior". Listings get a "Graduate and entry level only" filter.

### 5.5 Site changes

- Job page checklist rows: Sponsor licence, What the ad says (with quotes), Contract, Hours, Salary (both checks), Occupation, Experience. Unknown reason codes are already guarded by a test.
- Stamp label "Ad mentions sponsorship" becomes **"Sponsorship offered"**; the enum value stays `sponsorship_mentioned` so links and saved jobs keep working.
- `/how-we-check` rewritten to match these rules; the footer disclaimer is unchanged.
- The posting helper keeps picking green jobs only, and shows the experience label.

## 6. Data

- New table `job_readings` (above). New `jobs` columns: `detail_version`, `working_pattern`, `experience_level`, `experience_min_years`, `meets_new_entrant_rate`, `meets_general_rate`. Migrations through Drizzle, with RLS on and no public policies, as for every table.
- **The repo is public**, so no scraped ad text goes into it: tests use short single-sentence excerpts (as today); the labelled evaluation set lives in a database table (`reading_labels`), not in files.

## 7. Verification

- **Tests first** for the quote check, the stamp rules, the NHS parser (against a saved advert's HTML structure with invented text) and scheduling, built from the real failures: "does not apply", #42050 part-time, the 156 missed "no" sentences, Afin Bank, the Lloyds graduate schemes, export-licence and GMC wording, bank roles with the NHS box ticked.
- **Accuracy gate, before switching stamps:** about 200 live ads labelled by hand (Claude labels, the founder spot-checks 30, about 15 minutes). The reader must catch **≥98% of "no sponsorship" statements** and get contract and hours **≥95%** right. If Haiku misses the gate, a stronger model is tried and its cost brought back to the founder first.
- **Shadow run:** readings are stored and new stamps calculated alongside the live ones for at least one scrape; the Telegram report shows the before/after counts and samples. Then switch.
- **Verification before every commit request** (typecheck, lint, full tests, production build, red-green on fixes, credential scan).

## 8. Cost

- One-off reading of about 12,800 live ads: about **$6** (confirmed on a 100-ad trial first, about 5 cents).
- Ongoing: 450–900 new or changed ads a day, about **$5–10 a month**. The Batch API (half price) is a later option.
- The blueprint's cost table (§4.3) is updated.

## 9. Build order

1. NHS adapter: whole advert, working pattern, `detail_version` re-fetch; description cap; scheduling window; NHS expiry check.
2. Reader: schema, quote check, `job_readings`, cost caps, run-report section.
3. Rules: new stamp order, two salary checks, experience label; the held fixes (`signals.ts`, `salary.ts`, `score.ts`) are the base and stay as the second opinion.
4. Labelled set, accuracy gate, shadow run.
5. Site: checklist rows, labels, filters, `/how-we-check`; blueprint updates.
6. Switch stamps; retire `classify-jobs`.

Each step is verified before the next; commits are the founder's.

## 10. Left to the builder

Table and column names, prompt wording, batch sizes, how sections are joined in the NHS text, how the quote normaliser handles bullets, and UI details within the existing design system.

Calls made by Claude (founder to check while reading):
- Model Haiku 5.5 at medium effort, with a stronger model only if the gate fails.
- Description cap 20,000 characters.
- A scheduling window of 3 hours; NHS on the same 12-hour interval as other sources.
- Monthly AI cap of $15 in code.
- "Sponsorship offered" as the new label.

## 11. Unstated hours and contract (decided)

Only about 25% of today's green non-NHS jobs **state** both full-time and permanent/fixed-term in their ad (Greenhouse: 25 of 237); most tech ads don't say it. NHS ads always state both. The founder chose **stated-only blocks** (§4 item 8): unstated is treated as the normal full-time, permanent job, and the job page says "Not stated in the ad".
