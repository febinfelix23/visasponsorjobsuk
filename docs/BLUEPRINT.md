# VisaSponsorJobsUK — Product & Development Blueprint

_Last updated: 2026-10-19 · Status: v3, scope decisions locked, Phase 0 ready to build_

> **One-line thesis:** Every job board lets you search for "visa sponsorship" as a keyword. Nobody reliably tells you whether **this job, at this salary, for this occupation, can actually lead to a Skilled Worker visa for a UK graduate.** Our moat isn't the scraping. It's being **verified and checked for eligibility**.

---

## 0. Locked decisions (2026-10-18)

| Decision | Choice | What it changes |
|---|---|---|
| Audience | **UK graduates only** (Student → Skilled Worker, Graduate visa → Skilled Worker). No overseas applicants yet | Every user switches in-country, so they all qualify for **new-entrant salary rates**. One threshold model, not two. Lower scam exposure. Tone: "early career" |
| Sectors | **Tech, Finance, Engineering, Healthcare** | Filter sponsors by SIC code and jobs by SOC code. Cuts the crawl from ~120k sponsors to a few thousand |
| Team and budget | **Solo build, near-zero running cost** | Free tiers everywhere: GitHub Actions for scraping, Supabase + Vercel free tiers, rules before AI, no paid WhatsApp API (§4.3) |
| Pricing | **Free at launch → freemium later** | Collect accounts and alert sign-ups from day one, and track clicks, so a paid tier can be added later without rework |
| Brand and channels | **Domain, Telegram, Instagram and WhatsApp channels secured** | Posting is manual at first (§8 Phase 0), helped by an admin "posting helper" page |
| Repo | **Public** (changed 2026-10-19) | Unlimited free GitHub Actions minutes on standard runners. The scraper code being public is accepted for now. Rules: keys only in GitHub Actions secrets and `.env*` (already gitignored); no scraped data, bulk files or user data in the repo; admin password via env |
| Healthcare scope | **Includes junior doctors** | NHS Jobs doctor posts + national training recruitment (§2.3.1) |
| Curation | **No hand curation**: the founder has no time for it | Phase 0 *is* an automated scraper plus a demo listing site. The founder only posts the output to channels |

---

## 1. Framing

### 1.1 The problem
| Who | What they do today | Pain |
|---|---|---|
| International students finishing UK degrees (Graduate visa route ending) | Search LinkedIn/Indeed with "visa sponsorship", cross-check against the gov.uk sponsor CSV by hand | Slow, noisy, most results end in "we are unable to sponsor" |
| Graduate visa holders (2-year clock running) | Same, but racing a deadline | Applying to roles below the salary threshold that can never be sponsored |
| ~~Overseas skilled workers~~ | _Out of scope for now (see §0)_ | |

**JTBD:** _"When my Graduate visa clock is running, I want to see only graduate-level jobs in my field that can genuinely sponsor me, so that every application I send has a real chance."_

Note: the Graduate visa itself is being shortened (to 18 months for new applications under the 2025 immigration white paper; confirm the effective date). A shorter clock makes the urgency, and our value, higher.

The emotional job matters as much as the functional one: **cutting anxiety and avoiding being scammed.**

### 1.2 What makes this hard (things a naive build gets wrong)
1. **A licensed sponsor does not sponsor every role.** A company holding a licence can still say "no sponsorship" for a specific role. Since July 2025, Skilled Worker roles generally need to be RQF level 6+ and meet a salary threshold (general £41,700, new-entrant £33,400. **Verify the current figures; they change.**). Most scraped jobs from sponsors will *not* be sponsorable. **For our graduate audience**, switching from a Student or Graduate visa counts as a new entrant. The bar is the higher of the new-entrant floor and 70% of the occupation's going rate, for up to 4 years in total. This is the single rule our scoring engine needs first.
2. **The register has no websites or company numbers.** It has only Organisation Name, Town/City, County, Type & Rating and Route. Matching ~120k names to real domains is the hardest data problem here.
3. **The long tail has no careers page.** A large share of sponsors are care homes, restaurants and small firms that recruit through Indeed, agencies or word of mouth.
4. **WhatsApp is not a free broadcast channel** (see §6).
5. **UK legal exposure:** giving immigration *advice* is regulated (OISC, Immigration and Asylum Act 1999). We report facts ("salary meets the published threshold"). We never advise ("you will get a visa").

### 1.3 Riskiest assumptions (test these first)
| # | Assumption | Why it could kill us | Cheapest test |
|---|---|---|---|
| A1 | We can classify jobs as "likely sponsorable" accurately enough to earn trust | False positives = angry users, scam-like reputation | Hand-label 300 scraped jobs; measure rule/LLM precision. Target ≥90% precision on the "Likely" label |
| A2 | Enough sponsors use structured ATSes to give useful coverage cheaply | If coverage is <5k live jobs, the product feels empty | Resolve the top 1,000 sponsors → count ATS hits and live roles |
| A3 | Users will join and stay on Telegram/WhatsApp channels | Distribution is the whole growth plan | Post scraper output (via the posting helper) to Telegram, Instagram and Reddit for 2 weeks. Measure joins and clicks per channel with UTM links |
| A4 | The free audience is big and loyal enough to convert to freemium later | No business without it | Not tested at launch (free first). Track alert sign-ups and weekly returning users as leading indicators. Add a "Pro" waitlist only once there are 2k+ alert subscribers |
| A5 | Graduate-level, sponsorable roles in our 4 sectors are numerous enough | Too few jobs and the product feels empty | In Phase 0, count live roles from the top 200 sponsors that pass the new-entrant rule |

---

## 2. Product shape

### 2.1 Core loop
```
gov.uk sponsor CSV ──► Sponsor registry (deduped, enriched)
                           │
                           ▼
                 Careers-page / ATS discovery
                           │
                           ▼
                 Job scraping (adapters) ──► Normalise ──► Sponsorability scoring
                                                                 │
                     ┌───────────────────────────┬───────────────┼───────────────┐
                     ▼                           ▼               ▼               ▼
               Website (SEO)              Email/Telegram     WhatsApp        Instagram
               search + filters           personal alerts    channel/opt-in  job cards (top-of-funnel)
```

### 2.2 The differentiator: a sponsorability badge on every job
| Badge | Rule (v1) |
|---|---|
| ✅ **Sponsorship mentioned** | The job text explicitly offers sponsorship (regex + LLM confirmation) |
| 🟢 **Likely eligible** | Licensed Skilled Worker sponsor + salary ≥ **new-entrant** rate for that SOC code + occupation maps to an eligible SOC 2020 code + role is graduate/entry/junior level |
| 🟡 **Check with employer** | Licensed sponsor, but salary is missing or the occupation is borderline |
| ❌ **Hidden by default** | The text says "no sponsorship" / "must have right to work", or the salary is clearly below threshold |

Show the *reason* behind each badge (salary vs threshold, SOC code, sponsor rating A/B). That transparency is how we build trust. Always link to the employer's original posting.

### 2.3 Audience, sectors and filters
**One audience: UK graduates switching in-country.** There is no "experienced mode". Seniority filter: graduate scheme, entry level, junior, and mid-level up to about 3 years' experience. Senior roles are hidden by default.

**Sector scope**, mapped to codes (example SOC 2020 unit groups; verify each against the eligible occupations table):

| Sector | Sponsor filter (SIC 2007) | Job filter (SOC 2020, examples) | Notes |
|---|---|---|---|
| Tech | 62xxx, 63xxx, 58290 | 2131–2139 (IT/software, cyber, data, testing), 2433 data scientists* | Largest volume of ATS-hosted jobs (Greenhouse/Lever/Ashby) |
| Finance | 64xxx–66xxx, 69201 (accounting) | 2421 accountants, 2422 finance & investment analysts, 2423 tax, 2433 actuaries* | Many grad schemes, mostly on Workday/Oracle |
| Engineering | 71xxx, 25–30 (manufacturing), 35 (energy), 42 (civil) | 2121–2129 (civil, mechanical, electrical, design, production engineers), 3112–3119 technicians* | Check RQF level: technician roles may fail RQF 6 |
| Healthcare | 86xxx + **NHS trusts and health boards** (not on Companies House; match by name pattern in v0, NHS ODS data later) | 2211–2259 (doctors incl. junior doctors, pharmacists, nurses, midwives, allied health) | Graduate-level clinical roles only. Care worker roles closed to new sponsorship in 2025. The NHS Jobs adapter is essential |

_*Code numbers are indicative. Load the authoritative list from the Immigration Rules Appendix Skilled Occupations as a versioned table (§3.5)._

**Healthcare salary rule:** for listed health and education occupations, the Skilled Worker rules use **national pay scales** (e.g. Agenda for Change bands, the doctors' pay scales) instead of the general going rate. A role paid on the correct NHS band normally passes, so for NHS posts the scorer checks "is on a national pay scale" rather than "salary ≥ £X". Verify this against the current Appendix Skilled Occupations.

#### 2.3.1 Junior doctors (UK medical graduates)
Junior-doctor jobs come through two different pipelines, and each needs its own handling:

| Pipeline | What it is | How we cover it |
|---|---|---|
| **National training recruitment** (Foundation Programme via UKFPO/Oriel, specialty training via Oriel) | Centrally allocated training posts with fixed application windows. There are no per-job ads to scrape | A **recruitment-calendar page** (round name, opens, closes, link to the official site), maintained as a small seed file and checked each recruitment cycle. It's high value and low effort, and great content for channels ("FP applications open next week") |
| **Non-training / locally employed posts** (Clinical Fellow, Trust Grade, Junior Clinical Fellow, FY2-level/SHO-level, LAS posts) | Advertised individually by trusts on NHS Jobs (and Trac/HealthJobsUK) | **NHS Jobs adapter**, filtered by medical grade keywords. Tag `sector=healthcare`, `subsector=doctors` |

The UK government has announced plans to **prioritise UK medical graduates for training posts**, which suits our audience exactly. Check the current status before writing any content about it. NHS ads often include a standard sponsorship statement ("applications from job seekers who require Skilled Worker sponsorship… are welcome"). That is a strong positive signal for the scorer.

Filters: sector, location/region, salary, seniority, grad scheme vs direct entry, sponsor rating, "posted in last 24h", remote/hybrid, application deadline (grad schemes close early).

### 2.4 Explicit non-goals (v1)
- No immigration advice, CoS help, or visa application services
- No hosting of full job descriptions (snippet + link out, to respect copyright and database rights)
- No employer accounts or ATS of our own
- Outside the UK, nothing
- **Overseas applicants**: no out-of-country content or thresholds yet
- **Sectors beyond Tech/Finance/Engineering/Healthcare** (e.g. hospitality, care work)
- Senior or experienced-hire roles
- Paid features at launch

---

## 3. Data pipeline

### 3.1 Stage 1: Sponsor registry ingestion
- **Source:** "Register of licensed sponsors: workers" CSV on gov.uk (updated roughly daily). Resolve the current file URL from the gov.uk Content API (`/api/content/government/publications/register-of-licensed-sponsors-workers`). Don't hard-code it, because the attachment URL changes.
- **Daily job:** download, hash, diff against the previous snapshot, then record **added / removed / rating changed**. Removals and downgrades are valuable signals: suspended sponsors should hide their jobs immediately.
- **Filter:** Route = `Skilled Worker` (keep other routes in the DB, but they are out of scope for v1). Sector filtering happens after Companies House enrichment (SIC codes) or NHS ODS matching. Keep every sponsor row, and add an `in_scope` flag.
- **Normalise names:** strip "Ltd/Limited/PLC/LLP", t/a ("trading as") splits, punctuation, case.

### 3.2 Stage 2: Entity resolution and enrichment
For each sponsor, in this order:
1. **Companies House API** (free, rate-limited): search by normalised name and town → company number, SIC codes, status (dissolved → drop), incorporation date, registered address.
   NHS trusts and other public bodies aren't on Companies House. Match them against the free **NHS ODS** organisation data instead.
2. **Domain and ATS discovery, done cheaply (no paid search API):**
   - **ATS slug probing:** generate slug candidates from the normalised name (`monzo`, `monzobank`, `monzo-bank`), then probe the public endpoints of Greenhouse, Lever, Ashby, SmartRecruiters and Workable. A hit finds the ATS and the jobs in one step, and costs nothing.
   - **Sector tagging without API calls:** join the register against Companies House's free monthly **bulk company data CSV** (it includes SIC codes) by normalised name + town. This tags thousands of sponsors in one local run, with no API rate limits. Use the Companies House API only for ambiguous matches.
   - **No hand curation** (founder time constraint). The only manual input is a small seed file of ~20 Workday tenants for the big banks and engineering firms, which can't be slug-probed. Claude prepares that file.
   - Only then, for what's left: a guessed domain (`<name>.co.uk` / `.com`), verified by the company name or number appearing on the site.
3. **Priority score**, used to order the crawl: in-scope sector (required) × A-rated × known graduate employer × company size signals × "has ATS". **Start with the top ~1–2k in-scope sponsors.** The long tail comes later.

Store a `confidence` value for every match, and keep a manual-review queue for low-confidence matches.

### 3.3 Stage 3: Careers-page / ATS detection
Most UK employers post jobs through a handful of ATSes. Detecting the ATS is worth more than generic crawling.

| ATS | Access method |
|---|---|
| Greenhouse | Public boards JSON API |
| Lever | Public postings JSON API |
| Ashby | Public job-board API |
| SmartRecruiters | Public postings API |
| Workable | Public widget/JSON endpoints |
| Workday | `cxs` JSON endpoint behind the careers site |
| Teamtailor, Pinpoint, Recruitee, Personio, BambooHR | JSON/RSS feeds |
| iCIMS, SuccessFactors, Oracle/Taleo, Eploy, Tribepad | HTML / headless (harder) |
| NHS Jobs, Civil Service Jobs | Dedicated adapters. Huge sponsor volume (NHS trusts) |

**Detection:** fetch the homepage and `/careers` and `/jobs`, then scan for ATS fingerprints (iframe/script hosts, link patterns such as `boards.greenhouse.io/<slug>`). Store `ats_type` + `ats_slug` per sponsor.

### 3.4 Stage 4: Job scraping (adapter pattern)
```ts
interface JobSourceAdapter {
  type: AtsType;
  detect(html: string, url: string): AtsMatch | null;
  fetchJobs(match: AtsMatch): AsyncIterable<RawJob>;
}
```
Fallback chain for unknown sites:
1. **JSON-LD `JobPosting`** schema.org extraction (many sites include it for Google Jobs). This is cheap and structured.
2. **Headless render** (Playwright) + JSON-LD again.
3. **LLM extraction** from cleaned HTML, used only for the top ~300 sponsors and cached by page hash. Monthly spend cap enforced in code.

**Politeness rules (non-negotiable):** respect robots.txt, identify our user agent with a contact URL, per-domain rate limits, ETag/If-Modified-Since, and back off on 429/403. Prefer official public APIs over HTML.

**Refresh cadence:** ATS APIs every 6–12h; HTML sites daily; top sponsors more often. Mark jobs `expired` when they disappear from the source twice in a row.

### 3.5 Stage 5: Normalisation and scoring
- **Fields:** title, sponsor_id, location (geocoded → UK region), salary min/max/period (parse "£45k–£55k", "£22.50/hr"), employment type, seniority, posted_at, apply_url, description snippet.
- **Dedup:** the same job appears on the ATS and the company site. Hash on (sponsor, normalised title, location).
- **Seniority:** a rules-based classifier on the title ("graduate", "junior", "trainee", "associate", "senior", "lead", "principal") plus years-of-experience parsing. Drop senior roles early, before any AI call, to save cost.
- **SOC 2020 mapping:** **rules first** (a keyword → SOC dictionary covers most titles in our 4 sectors). Fall back to an LLM with constrained output against the SOC list only for unknown titles, cached by normalised title so each distinct title is classified once. Then look up eligibility and the going rate in the Immigration Rules appendix tables (load them as a versioned reference table).
- **Sponsorship text signals:** positive ("visa sponsorship available", "we can sponsor") / negative ("unable to sponsor", "must have the right to work without sponsorship").
- **Output:** a `sponsorability` enum + a `reasons` JSON (see §2.2).

---

## 4. Architecture

**Principle for a solo, low-cost build:** no always-on servers, nothing to babysit, free tiers wherever possible. Scrapers are short batch scripts, not a long-running service.

| Concern | Choice | Notes |
|---|---|---|
| Web app | **Next.js 16** (already in repo) on **Vercel Hobby** | SSR/ISR job pages for SEO: `/jobs/[slug]`, `/sponsors/[slug]`, `/jobs/in/[city]`, `/jobs/[sector]`. Hobby is for non-commercial use, so move to Pro when freemium launches |
| DB | **Supabase Free** Postgres + **Drizzle** (already in repo) | `pg_trgm` for fuzzy name match, full-text search for jobs. Free projects pause after about a week of inactivity, but the daily scrapes keep it active. Store snippets, not full descriptions, to stay under the 500 MB limit |
| Auth | Supabase Auth (magic link) | Needed only for saved searches and alerts. Gives us an email list for the future freemium launch |
| Workers + scheduling | **GitHub Actions cron** running `tsx` scripts (**public repo: unlimited minutes**) | Minutes are no longer a constraint, but each job is limited to 6 hours. Points to watch: (1) **GitHub disables scheduled workflows in public repos after 60 days without repo activity**, so commit regularly or add a keep-alive; (2) cron start times can drift by minutes under load, which is fine for us; (3) never print secrets or scraped personal data in public Action logs; (4) workflows triggered by pull requests from forks don't get secrets. Playwright is now affordable for the few sites that need it (Phase 2) |
| Queue | **None at first.** A `job_sources.next_crawl_at` column plus a script that processes the N most overdue sources | Add `pgmq` only if a single run gets too slow |
| Crawling | Native `fetch` for APIs, Playwright only when unavoidable | |
| LLM | Claude Haiku-class, **only as a fallback** (unknown titles, unstructured pages) | Rules first, cache by content hash, Batch API for backfills, hard monthly cap in code |
| Images (Instagram) | `next/og` (Satori) job-card templates | Free, rendered on Vercel |
| Email | Resend free tier | Weekly digest only. Telegram carries instant alerts (free, no daily cap) |
| Observability | Sentry free tier + an adapter-health table + a daily Telegram message to you | Adapters break silently. The daily "yield report" bot message is the cheapest form of monitoring |

### 4.1 Repo layout (proposal)
```
src/app/                 Next.js routes (public site, account, admin)
src/lib/db/              Drizzle schema + queries (shared with worker)
src/lib/sponsorability/  threshold tables, SOC mapping, scoring (pure, unit-tested)
scripts/                 batch jobs run by GitHub Actions cron (.github/workflows/*.yml)
  ingest/                gov.uk register
  resolve/               Companies House + domain discovery
  adapters/              greenhouse.ts, lever.ts, workday.ts, jsonld.ts, ...
  publish/               telegram.ts, whatsapp.ts, instagram.ts
supabase/migrations/
```

### 4.2 Core data model
```
sponsors            id, name, name_normalised, town, county, rating, routes[], first_seen, last_seen,
                    status(active|removed|downgraded), company_number, domain, match_confidence,
                    priority_score
sponsor_snapshots   date, file_hash, added_count, removed_count
job_sources         id, sponsor_id, ats_type, ats_slug/url, last_crawled_at, last_status, yield_7d
jobs                id, sponsor_id, source_id, external_id, title, location, region, salary_min,
                    salary_max, salary_period, soc_code, sponsorability, reasons(jsonb),
                    apply_url, snippet, posted_at, first_seen, last_seen, status
soc_reference       soc_code, title, eligible, going_rate, valid_from, valid_to   (versioned rules)
thresholds          route, type(general|new_entrant), amount, valid_from, valid_to
users / saved_searches / alert_deliveries
channel_posts       job_id, channel, external_post_id, posted_at, clicks
```
Additional columns for the locked scope: `sponsors.sector`, `sponsors.in_scope`, `sponsors.sic_codes[]`, `jobs.sector`, `jobs.seniority`, `jobs.is_grad_scheme`, `jobs.closing_date`. Add `users.plan` (default `free`) now so freemium is a flag flip later, not a migration.

### 4.3 Monthly running cost (target ≈ £0–5)
| Item | Cost |
|---|---|
| Vercel Hobby, Supabase Free, GitHub Actions, Sentry Free, Resend Free | £0 |
| Telegram Bot API, Instagram Graph API, WhatsApp Channel (manual) | £0 |
| LLM fallback (Haiku-class, cached, capped) | ~£0–5 |
| Domain | ~£10–15/year |
| **Upgrade triggers** (at freemium launch): Vercel Pro (~$20) when monetising, Supabase Pro (~$25) when the DB nears 500 MB or needs backups | Later |

---

## 5. Website and alerts (the owned channel)
**Treat the website as the product. Social channels are funnels into it.**
- Search plus filters, with a sponsorability badge and reasons on each job
- Sponsor profile pages: licence rating, live jobs, history ("licensed since…")
- Programmatic SEO pages: "Visa sponsorship software engineer jobs in Manchester". This is the largest free acquisition channel.
- **Saved-search alerts:** email + Telegram bot DM (instant, daily or weekly). Telegram bot DMs are free and personal, which makes them the best retention channel.
- Track outbound clicks (`/out/[jobId]`) so we can measure value and show employers later

---

## 6. Distribution channels: what's realistic

| Channel | Mechanism | Constraints | Role |
|---|---|---|---|
| **Telegram** | Bot API → post to public channels (by sector/city) + personal alert bot | Free, generous limits, no approval needed | **Primary community + alerts channel.** Launch here first |
| **WhatsApp** | **Channels have no official posting API.** The Business Platform (Cloud API) allows messages only to opted-in users, via pre-approved templates, with per-message fees for marketing templates | Unofficial libraries that automate groups/channels get numbers banned | **Decision: manual WhatsApp Channel daily digest only.** The site generates a copy-paste-ready digest (top 10 graduate roles per sector); posting it takes about 2 minutes. The paid Cloud API is postponed until freemium revenue covers it |
| **Instagram** | Graph API content publishing (Business/Creator account linked to a Facebook Page) | Images/carousels required; daily publishing caps; App Review for permissions | **Awareness, not delivery.** Daily carousel ("10 sponsored grad jobs this week"), Reels on visa tips (facts only). Link in bio → site |
| (Bonus) LinkedIn, TikTok, Reddit | Manual at first | — | Test cheaply |

**Content rule for all channels:** post only "Sponsorship mentioned" or "Likely eligible" jobs, always with an employer link, and **never a fee**. Run an anti-scam section on the site as a trust builder.

---

## 7. Legal, compliance and trust
- **Scraping:** respect robots.txt and ToS, prefer public ATS APIs, and don't republish full descriptions. Remove a source promptly on request.
- **UK GDPR:** job ads can contain recruiter names and emails, so strip them. Users: privacy policy, consent for alerts, unsubscribe in every message, data retention policy. Register with the ICO (data protection fee).
- **OISC boundary:** wording such as "salary meets the published Skilled Worker threshold as of {date}". Never "you qualify". Add a prominent disclaimer.
- **Accuracy:** version the threshold and SOC tables and show "rules as of" dates. Re-score all jobs when the rules change.
- **Crown copyright:** the sponsor register is published under the Open Government Licence. Attribute it.
- **Scam prevention:** never list jobs that ask for fees; give users a way to report a job.

---

## 8. Phased roadmap

_Durations assume Claude writes most of the code and the founder reviews, sets up accounts and posts. "Build" is coding time. Tuning and channel testing are calendar time spent waiting on real data._

### Phase 0: Automated scraper + demo listing site
| Stage | What happens | Rough duration | Founder time |
|---|---|---|---|
| **Build** | Steps 0.1–0.9 below | About 3–6 working sessions over a few days | ~1h of account/key setup (Supabase, Vercel, GitHub secrets, Telegram bot) + reviews |
| **Tuning** | First real runs, spread-out ATS discovery (rate-limited), fixing adapters, adjusting rules after the spot-check | About 1 week | ~30 min |
| **Channel test** | Daily posting to Telegram/Instagram/WhatsApp/Reddit; measure joins and clicks per channel | 2 weeks | ~10 min/day |

**The site is live with real jobs in about 1–2 weeks. The 2-week channel test follows.**
**Goal:** a scraper that fills a public listing site with graduate roles in the 4 sectors with **zero hand curation**, plus a posting helper. Your only daily task is to post its output to Telegram, Instagram, WhatsApp and Reddit (about 10 minutes).

Build order (each step is usable on its own):

| # | Deliverable | Detail |
|---|---|---|
| 0.1 | **Minimal schema** | `sponsors`, `job_sources`, `jobs`, `crawl_runs`, `clicks` (a subset of §4.2, with the `sector`, `seniority`, `sponsorability`, `reasons` columns included from the start) |
| 0.2 | **Register ingest** | Fetch the current CSV via the gov.uk Content API → upsert sponsors (Skilled Worker route) → mark removed sponsors. Daily GitHub Action |
| 0.3 | **Sector tagging** | Companies House bulk CSV join (SIC → sector) + name-pattern rules for NHS trusts and health boards → `in_scope` |
| 0.4 | **ATS discovery** | Slug probing of in-scope sponsors against Greenhouse, Lever, Ashby, SmartRecruiters and Workable public endpoints. Cache hits and misses, re-probe misses monthly. Plus the ~20-entry Workday seed file |
| 0.5 | **Adapters** | Greenhouse, Lever, Ashby, SmartRecruiters, Workable, **NHS Jobs** (incl. doctor grades), Workday (seed list). Normalise, dedup, expire jobs missing twice |
| 0.6 | **Scoring v0 (rules only, no AI)** | UK location · seniority = graduate/entry/junior · sector from SOC keyword rules · sponsorship text signals (positive/negative) · salary ≥ new-entrant floor, or NHS national pay scale → badge + reasons |
| 0.7 | **Demo website** (mobile-first; traffic arrives from Instagram/Telegram) | `/` and `/jobs`: search + filters (sector, location, badge, posted date, grad scheme). `/jobs/[slug]`: snippet, badge reasons, **Apply** button via `/out/[id]` (click tracking). `/sponsors/[slug]`: licence rating + live jobs. `/junior-doctors`: recruitment calendar + NHS doctor posts. Disclaimer/anti-scam page. No accounts yet |
| 0.8 | **Posting helper** (`/admin`, behind one admin password) | "Today's top N per sector" with **copy buttons**: a Telegram post, a WhatsApp digest, a Reddit weekly-roundup markdown, and an **Instagram carousel** (job cards rendered with `next/og`, downloadable as PNGs). Every link carries a UTM tag per channel |
| 0.9 | **Scheduling + health** | GitHub Actions: register daily, scrape every 12h. After each run, a Telegram bot message to you: "+142 new / 37 expired / adapter X failed" |

**Reddit note:** most UK job and career subreddits restrict self-promotion. Prefer one **weekly roundup** post per subreddit (where the rules allow it) and genuinely helpful comments, and read each subreddit's rules first. Link spam gets accounts banned.

**Exit criteria:**
- ≥300 live, in-scope graduate roles with badges
- A 50-job random spot-check of "Likely eligible" jobs is ≥85% correct (about 15 minutes of your time, once)
- A day's posting takes ≤10 minutes
- After 2 weeks: joins and clicks per channel tell us where to focus (A3)

### Phase 1: Data hardening (about 2–3 weeks)
- NHS ODS matching (replaces the NHS name patterns), Companies House API for ambiguous matches
- Register diffing → hide jobs from suspended or downgraded sponsors immediately
- Admin review queue for low-confidence sponsor matches and user-reported jobs

### Phase 2: Coverage expansion (about 3–4 weeks)
- More adapters: Teamtailor, Pinpoint, Recruitee, Personio, SuccessFactors, Oracle/Taleo, Trac / HealthJobsUK
- JSON-LD `JobPosting` fallback for company sites
- Adapter health dashboard (yield trends)

### Phase 3: Sponsorability engine (weeks 6–9, overlaps)
- Threshold + SOC reference tables (versioned), **new-entrant rates only for v1**
- Salary parser, seniority classifier, rules-first SOC classifier, text-signal classifier
- Scoring + reasons; precision measured against the labelled set
- **Gate:** ≥90% precision on "Likely eligible" before public launch

### Phase 4: Public site + alerts (weeks 8–11)
- Job search, job pages, sponsor pages, programmatic SEO pages
- Auth, saved searches, email + Telegram bot alerts
- Click tracking, analytics, disclaimer and anti-scam pages

### Phase 5: Distribution automation (weeks 10–13)
- Telegram auto-posting: 4 sector channels (Tech, Finance, Engineering, Healthcare), with dedup and a daily cap
- Instagram job-card generator + Graph API publishing (after App Review)
- WhatsApp Channel: "copy digest" button in the admin page (manual posting)

### Phase 6: Coverage and growth (month 4+, still free)
- Long-tail coverage within the 4 sectors: more adapters, LLM extraction for priority sites
- Grad-scheme calendar (opening/closing dates). Grad schemes open in autumn, so time the launch for **September–November**
- "Sponsor intelligence": newly licensed sponsors in the 4 sectors

### Phase 7: Freemium (when the leading indicators justify it)
- Trigger: about 2k+ active alert subscribers and steady weekly returning users
- Pro waitlist → paid tier (§9), upgrade to Vercel Pro / Supabase Pro

---

## 9. Business model options (later: launch is 100% free)
**Free forever:** search, sponsorability badges, Telegram/WhatsApp/Instagram channels, a weekly email digest. Never paywall the trust layer.

1. **Freemium alerts:** Pro gets instant personal alerts, advanced filters (SOC, salary vs threshold margin), grad-scheme deadline reminders, and early access (£3–£7/month)
2. **Employer featured listings:** sponsors pay to reach a pre-qualified international talent pool
3. **Affiliate:** CV review, English tests, relocation services. **Vet these carefully**, because a bad affiliate destroys trust
4. **Data product:** sponsor register analytics for recruiters and immigration law firms

My bet is (1) + (2). Users in this segment pay for speed when a visa clock is running, and employers pay for the pool.

---

## 10. Success metrics
| Stage | Metric |
|---|---|
| Coverage | Live jobs with "Likely eligible"+, number of sponsors crawled, adapter success rate |
| Quality | Precision of sponsorability label (sampled weekly), user "this job doesn't sponsor" reports |
| Acquisition | Channel subscribers (Telegram/WhatsApp/IG), organic search sessions |
| Engagement | Weekly active alert recipients, outbound apply clicks per user |
| **North star** | **Weekly apply-clicks on "Likely eligible" jobs** |
| Revenue | Pro conversion, employer listings |

---

## 11. Open questions
**Answered 2026-10-18** (see §0): audience = UK graduates only; sectors = Tech, Finance, Engineering, Healthcare; solo build on a minimal budget; free first, freemium later.

**Answered 2026-10-19:** domain + Telegram/Instagram/WhatsApp channels secured; repo **public** (initially answered private, then changed for unlimited Actions minutes); junior doctors included; Phase 0 = automated scraper + demo site (no hand curation).

**Still open:** none blocking Phase 0.

## 12. Parked ideas (interesting, not now)
- Reverse marketplace: candidates publish profiles and sponsors reach out
- "Will they sponsor?" history: track which sponsors actually issued CoS-eligible roles over time
- Browser extension that overlays a sponsor badge on LinkedIn/Indeed
- Salary-threshold calculator and Graduate-visa countdown planner (facts only)
- Global Talent / Scale-up route coverage
