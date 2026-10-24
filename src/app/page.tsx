import Link from "next/link";
import { Suspense } from "react";
import { AutoSubmitForm } from "@/components/site/auto-submit";
import { FIELD_KEYS, FIELD_LABEL, isFieldKey } from "@/lib/scoring/fields";
import { JobList } from "@/components/site/job-row";
import { Stamp } from "@/components/site/stamp";
import { fieldCounts, PAGE_SIZE, searchJobs, siteStats, type Filters } from "@/lib/site/queries";
import { RULES_UPDATED_AT } from "@/lib/scoring/occupations";

type SearchParams = Record<string, string | string[] | undefined>;

function parseFilters(sp: SearchParams): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  // "sector" (tech/finance/engineering/healthcare) was the old parameter; keep those links working.
  const legacy: Record<string, string> = { tech: "software" };
  const field = one("field") || legacy[one("sector")] || one("sector");
  const page = Number(one("page"));
  return {
    q: one("q").trim().slice(0, 80) || undefined,
    field: isFieldKey(field) ? field : undefined,
    show: one("show") === "all" ? "all" : "passes",
    includeSenior: one("senior") === "1",
    gradSchemes: one("grad") === "1",
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 200) : 1,
  };
}

function hrefFor(f: Filters, page: number) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.field) p.set("field", f.field);
  if (f.show === "all") p.set("show", "all");
  if (f.includeSenior) p.set("senior", "1");
  if (f.gradSchemes) p.set("grad", "1");
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

async function Intro() {
  const stats = await siteStats();
  return (
    <section aria-labelledby="intro" className="mb-8">
      <h1 id="intro" className="font-expanded text-[1.9rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-[2.4rem]">
        Graduate jobs at UK employers licensed to sponsor visas
      </h1>
      <p className="mt-4 max-w-[34rem] text-[1.05rem] leading-relaxed text-ink-soft">
        Every job is checked against the Skilled Worker rules for people switching from a Student or Graduate visa:
        the employer&apos;s licence, the occupation, and the new-entrant salary. {stats.jobs.toLocaleString("en-GB")} live
        jobs from {stats.sponsors.toLocaleString("en-GB")} licensed sponsors.
      </p>
    </section>
  );
}

async function SearchAndResults({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = parseFilters(await searchParams);
  const [{ items, total }, counts] = await Promise.all([searchJobs(filters), fieldCounts()]);
  // Fields with nothing to show stay out of the row, unless it's the one selected.
  const chips = FIELD_KEYS.filter((k) => k !== "other" && ((counts[k] ?? 0) > 0 || filters.field === k));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <AutoSubmitForm action="/" method="get" role="search" aria-label="Search jobs" className="space-y-4">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">Job title, employer or town</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Job title, employer or town"
            className="h-11 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-base placeholder:text-ink-soft/70"
          />
          <button type="submit" className="h-11 shrink-0 rounded-md bg-ink px-4 font-semibold text-white hover:bg-ink/90">
            Search
          </button>
        </div>

        {/* min-w-0: fieldsets default to min-content width, which would widen the page instead of scrolling the chips. */}
        <fieldset className="min-w-0">
          <legend className="sr-only">Field of work</legend>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {[undefined, ...chips].map((s) => {
              const checked = filters.field === s;
              const n = s ? (counts[s] ?? 0) : allCount;
              return (
                <label
                  key={s ?? "all"}
                  // relative: keeps the visually hidden radio inside the scrolling row instead of widening the page.
                  className={`relative flex shrink-0 cursor-pointer items-baseline gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.94rem] has-focus-visible:outline-2 has-focus-visible:outline-teal ${
                    checked ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink-soft"
                  }`}
                >
                  <input type="radio" name="field" value={s ?? ""} defaultChecked={checked} className="sr-only" />
                  {s ? FIELD_LABEL[s] : "All fields"}
                  <span className={`text-xs tabular ${checked ? "text-white/70" : "text-ink-soft"}`}>{n}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[0.94rem]">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="grad" value="1" defaultChecked={filters.gradSchemes} className="size-4 accent-teal" />
            Graduate schemes only
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="show" value="all" defaultChecked={filters.show === "all"} className="size-4 accent-teal" />
            Include jobs to check with the employer
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="senior" value="1" defaultChecked={filters.includeSenior} className="size-4 accent-teal" />
            Include senior roles
          </label>
        </div>
      </AutoSubmitForm>

      <section aria-labelledby="results" className="mt-8">
        <h2 id="results" className="text-[0.94rem] text-ink-soft" aria-live="polite">
          {total.toLocaleString("en-GB")} {total === 1 ? "job" : "jobs"}
          {filters.show === "passes" ? " that pass our checks" : " at licensed sponsors"}
          {pages > 1 ? `, page ${filters.page} of ${pages}` : ""}
        </h2>

        {items.length > 0 ? (
          <div className="mt-3">
            <JobList jobs={items} />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-line bg-white p-6">
            <p className="font-semibold">No jobs match these filters.</p>
            <p className="mt-1 text-ink-soft">
              Try another field, or{" "}
              <Link className="underline underline-offset-2" href={hrefFor({ ...filters, show: "all", page: 1 }, 1)}>
                include jobs to check with the employer
              </Link>
              .
            </p>
          </div>
        )}

        {pages > 1 ? (
          <nav aria-label="Pages" className="mt-6 flex items-center justify-between text-[0.94rem]">
            {filters.page > 1 ? (
              <Link className="rounded-md border border-line bg-white px-3 py-2 hover:border-ink-soft" href={hrefFor(filters, filters.page - 1)}>
                Previous page
              </Link>
            ) : <span />}
            {filters.page < pages ? (
              <Link className="rounded-md border border-line bg-white px-3 py-2 hover:border-ink-soft" href={hrefFor(filters, filters.page + 1)}>
                Next page
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}

function Key() {
  return (
    <aside aria-labelledby="key" className="mt-12 rounded-lg border border-line bg-white p-5">
      <h2 id="key" className="font-semibold">What the stamps mean</h2>
      <dl className="mt-3 space-y-3 text-[0.94rem]">
        {(["sponsorship_mentioned", "likely_eligible", "check_with_employer"] as const).map((s) => (
          <div key={s} className="grid gap-1 sm:grid-cols-[13rem_1fr] sm:gap-3">
            <dt><Stamp status={s} /></dt>
            <dd className="text-ink-soft">
              {s === "sponsorship_mentioned" && "The job ad itself says sponsorship is available."}
              {s === "likely_eligible" && "Licensed sponsor, an eligible occupation, and a salary at or above the new-entrant rate for that occupation."}
              {s === "check_with_employer" && "Licensed sponsor, but the ad doesn't show everything needed to confirm the rules, often the salary."}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-ink-soft">
        Salary rules as of {new Date(RULES_UPDATED_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}.{" "}
        <Link className="underline underline-offset-2" href="/how-we-check">How we check</Link>
      </p>
    </aside>
  );
}

function ResultsFallback() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="h-11 rounded-md bg-white" />
      <div className="h-9 w-2/3 rounded-full bg-white" />
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="py-4">
            <div className="h-4 w-3/4 rounded bg-line/60" />
            <div className="mt-2 h-3 w-1/2 rounded bg-line/40" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    <>
      <Intro />
      <Suspense fallback={<ResultsFallback />}>
        <SearchAndResults searchParams={props.searchParams} />
      </Suspense>
      <Key />
    </>
  );
}
