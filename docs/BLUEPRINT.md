# VisaSponsorJobsUK — Product & Development Blueprint

_Last updated: 2026-10-26 · Status: v5, premium decided: one-off passes, Telegram alerts, saved jobs and tracker (§13)_

> **One-line thesis:** Every job board lets you search for "visa sponsorship" as a keyword. Nobody reliably tells you whether **this job, at this salary, for this occupation, can actually lead to a Skilled Worker visa for a UK graduate.** Our moat isn't the scraping. It's being **verified and checked for eligibility**.

---

## 0. Locked decisions (2026-10-18)

| Decision | Choice | What it changes |
|---|---|---|
| Audience | **UK graduates only** (Student → Skilled Worker, Graduate visa → Skilled Worker). No overseas applicants yet | Every user switches in-country, so they all qualify for **new-entrant salary rates**. One threshold model, not two. Lower scam exposure. Tone: "early career" |
| Sectors | **Tech, Finance, Engineering, Healthcare** | Filter sponsors by SIC code and jobs by SOC code. Cuts the crawl from ~120k sponsors to a few thousand |
| Team and budget | **Solo build, near-zero running cost** | Free tiers everywhere: GitHub Actions for scraping, Supabase + Vercel free tiers, rules before AI, no paid WhatsApp API (§4.3) |
| Pricing | **Free job board + paid premium (changed 2026-10-26)** | Search, badges, job and sponsor pages stay free for everyone, like a normal job board. Premium is sold as **one-off passes** (§13.8), never subscriptions |
| Brand and channels | **Domain, Telegram, Instagram and WhatsApp channels secured** | Posting is manual at first (§8 Phase 0), helped by an admin "posting helper" page |
| Repo | **Public** (changed 2026-10-19) | Unlimited free GitHub Actions minutes on standard runners. The scraper code being public is accepted for now. Rules: keys only in GitHub Actions secrets and `.env*` (already gitignored); no scraped data, bulk files or user data in the repo; admin password via env |
| Healthcare scope | **Includes junior doctors** | NHS Jobs doctor posts + national training recruitment (§2.3.1) |
| Curation | **No hand curation**: the founder has no time for it | Phase 0 *is* an automated scraper plus a demo listing site. The founder only posts the output to channels |
| Premium feature (2026-10-23) | **Tailored feed + relevant-job alerts** for paid users, matched to their degree, with an extra view based on recent work experience | Education and experience collected at sign-up; jobs matched by occupation code (§13) |
| Premium terms (2026-10-26) | **Passes: £4.99 a week, £12.99 a month, £39 lifetime**, paid once through **Stripe Checkout**. No auto-renewal: users buy again when a pass ends. **Alerts go by Telegram only in v1** (no email). Free accounts get **saved jobs and an application tracker**; premium adds **closing-date reminders** | §13.5 (free vs premium), §13.8 (passes and payments), §13.9 (build order) |
| Content (2026-10-23) | **AI blog writer in the admin area**: suggests data-driven topics, drafts posts; the founder reviews, edits and publishes | No auto-publishing; no immigration advice or promises (§14) |

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
| A4 | Enough graduates will pay for a pass (week, month or lifetime) to cover running costs | No business without it | Track free accounts, the 3-match preview → pass conversion, which pass people choose, and repeat purchases (§13.7) |
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
| Web app | **Next.js 16** (already in repo) on **Vercel Hobby** | SSR/ISR job pages for SEO: `/jobs/[slug]`, `/sponsors/[slug]`, `/jobs/in/[city]`, `/jobs/[sector]`. Hobby is for non-commercial use, so move to Pro before the first premium payment |
| DB | **Supabase Free** Postgres + **Drizzle** (already in repo) | `pg_trgm` for fuzzy name match, full-text search for jobs. Free projects pause after about a week of inactivity, but the daily scrapes keep it active. Store snippets, not full descriptions, to stay under the 500 MB limit |
| Auth | **Supabase Auth with Google** (built 2026-10-24) | One sign-in for job seekers and admins. Admin is `app_metadata.role = "admin"`, which users can't set themselves; the proxy and every admin page check it |
| Payments | **Stripe Checkout, one-off payments** (`mode: payment`) | Hosted page (cards, Apple Pay, Google Pay); card details never reach our servers. A signed webhook grants the pass. About 1.5% + 20p per UK card. No VAT registration until sales pass £90k a year |
| Workers + scheduling | **GitHub Actions cron** running `tsx` scripts (**public repo: unlimited minutes**) | Minutes are no longer a constraint, but each job is limited to 6 hours. Points to watch: (1) **GitHub disables scheduled workflows in public repos after 60 days without repo activity**, so commit regularly or add a keep-alive; (2) cron start times can drift by minutes under load, which is fine for us; (3) never print secrets or scraped personal data in public Action logs; (4) workflows triggered by pull requests from forks don't get secrets. Playwright is now affordable for the few sites that need it (Phase 2) |
| Queue | **None at first.** A `job_sources.next_crawl_at` column plus a script that processes the N most overdue sources | Add `pgmq` only if a single run gets too slow |
| Crawling | Native `fetch` for APIs, Playwright only when unavoidable | |
| LLM | Claude Haiku-class, **only as a fallback** (unknown titles, unstructured pages) | Rules first, cache by content hash, Batch API for backfills, hard monthly cap in code |
| Images (Instagram) | `next/og` (Satori) job-card templates | Free, rendered on Vercel |
| Email | **Not used in v1** (decided 2026-10-26) | Premium alerts and reminders go by Telegram (free, instant). Resend stays the option if email alerts are added later |
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
Additional columns for the locked scope: `sponsors.sector`, `sponsors.in_scope`, `sponsors.sic_codes[]`, `jobs.sector`, `jobs.seniority`, `jobs.is_grad_scheme`, `jobs.closing_date`. Premium access comes from a `passes` table (one row per purchase, §13.6), not a `users.plan` flag: a user is premium while any pass is current.

### 4.3 Monthly running cost (target ≈ £0–5)
| Item | Cost |
|---|---|
| Vercel Hobby, Supabase Free, GitHub Actions, Sentry Free, Resend Free | £0 |
| Telegram Bot API, Instagram Graph API, WhatsApp Channel (manual) | £0 |
| LLM fallback (Haiku-class, cached, capped) | ~£0–5 |
| Job classification: field of work + occupation code (Claude Haiku 5.5, cached per title; first pass of 5,490 titles cost $0.27) | ~£0.30/month |
| AI board check for ambiguous job boards (Claude Opus 5.5, about $0.005 per board, once per board) | ~£1/month |
| Domain | ~£10–15/year |
| Stripe fees: about 1.5% + 20p per UK card payment (no monthly fee) | Per sale |
| **Upgrade triggers:** **Vercel Pro (~$20/month) before taking the first payment**, because Hobby is for non-commercial use only; Supabase Pro (~$25) when the DB nears 500 MB or needs backups | At premium launch |

---

## 5. Website and alerts (the owned channel)
**Treat the website as the product. Social channels are funnels into it.**
- Search plus filters, with a sponsorability badge and reasons on each job
- Sponsor profile pages: licence rating, live jobs, history ("licensed since…")
- Programmatic SEO pages: "Visa sponsorship software engineer jobs in Manchester". This is the largest free acquisition channel.
- **Saved jobs and tracker (free account), relevant-job alerts and closing-date reminders (premium):** sent as Telegram bot DMs, which are free, instant and personal, the best retention channel (§13.4).
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
| 0.8 | **Posting helper** (`/admin`, admin accounts only: Supabase Auth with Google) | "Today's top N per sector" with **copy buttons**: a Telegram post, a WhatsApp digest, a Reddit weekly-roundup markdown, and an **Instagram carousel** (job cards rendered with `next/og`, downloadable as PNGs). Every link carries a UTM tag per channel; links open our job pages, and the channel tag is carried through to the Apply click so `/out` counts clicks per channel. Picks are automatic: graduate, entry and junior roles first, no manager or senior roles, one per employer per field |
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
- Auth (Google), saved jobs and tracker, Telegram bot alerts (premium, §13)
- **Sign-up profile** (education + work experience, §13.2) asked of every account, so the 3-match preview works before anyone pays
- Click tracking, analytics, disclaimer and anti-scam pages

### Phase 5: Distribution automation (weeks 10–13)
- Telegram auto-posting: 4 sector channels (Tech, Finance, Engineering, Healthcare), with dedup and a daily cap
- Instagram job-card generator + Graph API publishing (after App Review)
- WhatsApp Channel: "copy digest" button in the admin page (manual posting)

### Phase 6: Coverage and growth (month 4+, still free)
- Long-tail coverage within the 4 sectors: more adapters, LLM extraction for priority sites
- Grad-scheme calendar (opening/closing dates). Grad schemes open in autumn, so time the launch for **September–November**
- "Sponsor intelligence": newly licensed sponsors in the 4 sectors
- **AI blog writer** in the admin area (§14): SEO compounds over time, so it starts while the site is still free

### Phase 7: Premium (brought forward, decided 2026-10-26)
- Built straight after the Phase 0 site, in steps A–F (§13.9): accounts and profile, saved jobs and tracker, passes and payments, matching and the matches page, Telegram alerts and reminders, legal pages
- Move to Vercel Pro before the first payment; Supabase Pro when the database nears its limits

---

## 9. Business model
**Free forever:** search, sponsorability badges, job and sponsor pages, the public Telegram/WhatsApp/Instagram channels, and (with a free account) saved jobs and an application tracker. Never paywall the trust layer.

1. **Premium passes (decided 2026-10-26, §13):** the **tailored feed** (jobs matched to the user's degree, plus a work-experience view), **Telegram alerts for strongly relevant new jobs** and **closing-date reminders**, sold as one-off passes: **£4.99 a week, £12.99 a month, £39 lifetime**. No subscriptions
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
- CV upload to fill in the sign-up profile automatically (§13)
- AI-suggested social posts (Telegram/Instagram captions) from the same data the blog writer uses (§14)

---

## 13. Premium: tailored feed and relevant-job alerts

### 13.1 Intent
A paid graduate opens their feed and sees **only jobs in their field**. A Computer Science graduate sees frontend, full stack, DevOps and similar roles, and never a nursing post. A Mechanical Engineering graduate never sees a doctor's job. Any job outside their field makes the product feel random, and that is the failure this feature exists to prevent.

| Goals | Non-goals | Anti-goals (failure even if it "works") |
|---|---|---|
| Field-accurate feed from degree subject | CV parsing or AI career coaching (v1) | A job from an unrelated field appears in someone's feed |
| Closely related roles included, ranked below core ones | Matching on skills or keywords in free text | Showing a job that fails the visa checks without saying so |
| Optional view based on recent work experience | Employer-side candidate search | Alerts that feel like spam |
| Telegram alerts for strongly relevant new jobs | Paywalling the trust layer (badges stay free) | Collecting more personal data than the matching needs |

### 13.2 Sign-up profile
Asked of **every** user when they create an account (free or paid), so the 3-match preview works before anyone pays and the feed has data the moment a pass is bought. Sign-in is Google through Supabase Auth.

| Field | Detail |
|---|---|
| Degree(s) | Level (Bachelor's, Master's, MBA, PhD, MBBS/MBChB and similar), **subject chosen from a fixed list** (not free text, so it maps cleanly), university (optional), graduation year |
| Work experience (optional) | Entries of job title, employer, start and end dates. Most recent first |
| Visa situation (optional) | Student visa or Graduate visa, and the Graduate visa expiry date (used for "closing soon" urgency, never for advice) |
| Preferences | Locations, remote/hybrid, and how alerts arrive (instant or daily digest) |

The subject list is based on the HESA **Common Aggregation Hierarchy (CAH)** subject codes used by UK universities, so every UK degree has a home. _(My call.)_

### 13.3 How matching works
Every job already gets a **SOC 2020 occupation code** and a **field of work** (Phase 0.6–0.7: Claude Haiku 5.5 reads each job, with keyword rules as the fallback; fields are defined once in `src/lib/scoring/fields.ts`). The feed matches occupation codes, not keywords. That's what keeps nursing out of a CS feed even when an ad mentions "software".

1. **Subject → occupations table** (`subject_occupations`): each CAH subject maps to SOC unit groups with a strength, **core** or **related**. For example:
   - Computer Science: core = programmers and software development, web design, IT and cyber security, IT testing; related = data analysts, IT business analysts, IT project roles, technical consultancy.
   - Mechanical Engineering: core = mechanical, design and development, and production engineers; related = engineering project management, quality, and technical sales.
   - Nursing: core = nursing SOC groups only.

   Built once by hand-checking AI-drafted mappings, versioned, and editable in the admin area. _(My call.)_
2. **Degree view (default):** jobs whose SOC is core or related for any of the user's subjects. Each card is labelled **"Core match"** or **"Related"**.
3. **"Based on your recent work experience" view (optional toggle):** the user's most recent job titles are classified into SOC codes with the same classifier used for jobs (0.6), plus their related groups. Example: a Physics graduate with two years as a DevOps engineer switches to this view and sees DevOps and cloud roles.
4. **Visa checks apply in both views:** graduate/entry/junior seniority, salary at or above the new-entrant rate (or the NHS pay scale), and a licensed sponsor. Jobs that fail are hidden. Borderline ones ("Check with employer") are shown with their badge.
5. **Ranking:** core before related, then sponsorability (sponsorship mentioned, then likely eligible, then check with employer), then closing soon, then newest. Preferences (location, remote) filter the list.

### 13.4 Telegram alerts and reminders (premium)
- **Linking:** on the account page, a premium user taps "Connect Telegram", which opens our public bot through a one-time link (`t.me/<bot>?start=<token>`). The bot's webhook matches the token to the account and stores the chat ID. A separate bot from the founder's run-report bot, so customer messages and operations alerts never mix. Users can disconnect at any time, and `/stop` in the bot does the same.
- **Relevant-job alerts:** sent when a **new** job is a core match, or a related match with "Sponsorship mentioned", **and** passes the visa checks. The user picks which view alerts follow (degree, experience or both) and how they arrive: **instant** (default, capped at 5 a day; anything over rolls into the next digest, so a big employer posting 40 roles can't flood them) or a **daily digest**.
- **Closing-date reminders:** 3 days before a saved job or a core match closes, unless the tracker already says "Applied" or later.
- **When:** a step in the scrape workflow, after scoring, so alerts go out minutes after jobs arrive. Every message is recorded in `alert_deliveries`, which stops repeats.
- **When a pass ends:** alerts stop, and one message says the pass has ended and how to buy another. No other marketing messages.
- Email alerts aren't in v1. Resend is the option if they're added later.

### 13.5 Free vs premium
| Free, no account | Free account | Premium (a current pass) |
|---|---|---|
| Search with filters, sort and pagination | **Saved jobs** | **Matches page**: tailored feed by degree, plus the work-experience view |
| Sponsorship stamps with reasons, job and sponsor pages | **Application tracker**: saved, applied, interview, offer, rejected | **Telegram alerts** for strongly relevant new jobs |
| Public Telegram, WhatsApp and Instagram channels | **Preview**: the top 3 matches from their tailored feed, to show what premium unlocks | **Closing-date reminders** for saved jobs and core matches |

### 13.6 Data and privacy
- New tables: `user_profiles` (degree level, CAH subject codes, graduation year, visa type and expiry, preferences, alert settings), `user_experience` (title, employer, dates, derived SOC), `subject_occupations` (subject, SOC, strength, version), `saved_jobs` (user, job, tracker status, dates), `passes` (§13.8), `telegram_links` (user, chat ID, linked at), `alert_deliveries` (user, job, kind, sent at), `match_feedback` ("Not relevant to me" reports).
- The profile is personal data. Explain why each field is asked for, keep it to what matching needs, and let users edit or delete it (account deletion removes everything except payment records, which the law requires us to keep for six years).
- No special-category data is asked for. Visa type and expiry are optional and used only for "closing soon" urgency, never for advice.
- All user data is read and written on the server with the user's ID from their verified session; row-level security stays on with no public policies, so the database can't be read from the browser.

### 13.7 Success measures
- Premium users opening the matches page weekly, and the click-through rate from the feed and from alerts
- **"Not relevant" reports per 100 feed views.** Every card gets a "Not relevant to me" button, and this number should trend towards zero. It is the direct measure of the anti-goal
- Conversion from the free 3-match preview to a pass, and which pass people choose
- Repeat purchases: how many week and month buyers buy again when their pass ends

### 13.8 Passes and payments
| Pass | Price | Access |
|---|---|---|
| Week | £4.99 | 7 days from purchase |
| Month | £12.99 | 30 days from purchase |
| Lifetime | £39 | For as long as the service runs |

- **One-off payments through Stripe Checkout** (`mode: payment`): no stored cards, no auto-renewal, no subscriptions to cancel. Stripe sends the receipt.
- **Renewing:** buying while a pass is current adds the new period to the current end date, so nobody loses days by renewing early. A lifetime pass makes further passes unnecessary, and the pricing page says so.
- **Granting access:** Stripe's signed webhook (`checkout.session.completed`) creates the `passes` row. The handler verifies the signature, and it is idempotent: one row per Stripe session, so a repeated notification can't grant twice. The return page shows "Payment received" only once the row exists.
- **UK consumer law:** digital services carry a 14-day right to cancel. Checkout asks for explicit consent to start premium immediately and an acknowledgement that this ends the right to cancel once the service has been fully provided; Terms set out refunds.
- **Lifetime promise:** the Terms define "lifetime" as for as long as the service runs, and say what happens if it ever closes (pro-rata refunds, or the rule the founder decides).
- **VAT:** no registration needed until sales pass £90,000 in 12 months.
- **Founder setup:** a Stripe account (test mode first), `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env.local` and Vercel, and a webhook endpoint at `/api/stripe/webhook`.

### 13.9 Build order
Each step is usable on its own and verified before the next.

| Step | Delivers | Needs from the founder |
|---|---|---|
| A. Accounts and profile | Job-seeker sign-in (same Google sign-in), account menu in the header, profile page (degree from the CAH list, graduation year, optional experience, visa type and expiry, location preferences), edit and delete account | Nothing |
| B. Saved jobs and tracker | Save button on job rows and job pages, a "My jobs" page with application status | Nothing |
| C. Passes and payments | Pricing page, Stripe Checkout, signed webhook, current pass and receipts on the account page, consent for immediate access | Stripe account and keys (test mode) |
| D. Matching | `subject_occupations` table drafted by Claude Haiku, then reviewed; matches page with "Core match" and "Related", the work-experience view, the 3-match preview for free accounts, "Not relevant to me" feedback | About 20 minutes to review the subject → occupation table |
| E. Telegram alerts and reminders | Public bot and webhook, "Connect Telegram", alert and reminder step in the scrape workflow, delivery log | A second Telegram bot from BotFather, for job seekers |
| F. Legal and launch | Terms (passes, no auto-renewal, refunds, lifetime), Privacy (profile data, Stripe, Telegram), move to Vercel Pro | Review both pages; upgrade Vercel |

---

## 14. AI blog writer (admin)

### 14.1 Intent
Bring graduates in from Google with posts built on **data only this site has**: live sponsorable jobs, register changes and closing dates. The founder stays in control. The AI **suggests topics and drafts**; the founder **chooses, checks, edits and publishes**. Nothing goes live automatically.

| Goals | Non-goals | Anti-goals |
|---|---|---|
| Data-driven topic suggestions, refreshed daily | Auto-publishing | **Immigration advice or promises** ("you will get a visa", "guaranteed sponsorship") |
| Drafts with real figures and internal links | Generic posts any site could write | Figures that don't come from the site's own data |
| SEO title, meta description and URL per post | Mass-produced thin content (Google penalises scaled AI content) | Anything published without the founder's review |

### 14.2 Flow (in `/admin/blog`)
1. **Topic suggestions.** A daily job, plus a "Suggest topics" button, reads the site's data and proposes about 5–10 topics. Each comes with a working title, the angle, a target search phrase, why it's timely, and the **data snapshot** behind it. Sources:
   - register changes (`sponsor_events`): sponsors added or removed this week, by sector
   - live listings: counts by sector, city and employer; new graduate schemes; schemes closing soon
   - NHS: roles carrying the Certificate of Sponsorship statement, by profession or band
   - rule changes: a new version of the salary threshold or occupation tables (§3.5) triggers an explainer suggestion
   - site activity: most-clicked employers and roles (clicks table)
2. **The founder picks one** (or dismisses suggestions).
3. **Draft.** The AI writes the post from the topic and its data snapshot. Output:
   - body in Markdown
   - an SEO title of 60 characters or fewer, a meta description of 155 or fewer, and a suggested slug
   - an optional FAQ block
   - **internal links** to the relevant job, sponsor and city pages
   - links to gov.uk for any rule mentioned
4. **Automatic checks before review**, shown as highlights in the editor:
   - **Advice and promise phrases** ("you will", "guarantee", "definitely get", "eligible for a visa", "we can sponsor") are flagged.
   - **Every number** in the draft is checked against the data snapshot. Numbers that aren't in it are flagged.
   - Missing "data as of" date, or a rule mentioned without a gov.uk link, is flagged.
5. **Edit:** a Markdown editor with live preview and "rewrite this section" for one part at a time.
6. **Publish:** the founder clicks Publish. The post gets a visible "Figures as of {date}" line and a short disclaimer ("Facts, not immigration advice").

### 14.3 Rules given to the AI (system prompt)
- Use only figures from the supplied data snapshot. Never invent numbers, employers or deadlines.
- State facts ("X is a licensed sponsor", "the salary is above the published new-entrant rate as of {date}"). **Never give immigration advice or make promises** about visas or sponsorship. Point readers to gov.uk for rules.
- Write for UK graduates on Student or Graduate visas, in plain British English and a friendly, factual tone.
- Link to the site's own job, sponsor and city pages wherever relevant.

### 14.4 Public blog
- `/blog` and `/blog/[slug]`, server-rendered, with Article structured data (JSON-LD), sitemap entries, and an OG image from `next/og`.
- Each post links to the live listings it discusses, so readers land on current jobs and not only the article.

### 14.5 Data model and cost
- `blog_topics`: title, angle, target phrase, data snapshot (jsonb), status (suggested / selected / dismissed), created_at.
- `blog_posts`: topic, slug, SEO title, meta description, body (Markdown), status (draft / published), data_as_of, published_at, model used, created and updated timestamps.
- Model: Claude through the Anthropic API (`ANTHROPIC_API_KEY` as an env secret), with a stronger model for drafts and a cheaper one for topic suggestions. Expect roughly pennies per draft. A monthly spend cap in code keeps it inside the "≈ £0–5/month" budget (§4.3) at a few posts a week. _(My call; check current pricing when building.)_

### 14.6 Success measures
- Organic search sessions landing on blog posts, and clicks from posts through to job pages
- Search ranking for target phrases (Google Search Console)
- How much the founder edits each draft, which shows prompt quality. Fewer edits over time is the goal; zero edits is not, because review stays mandatory
