import { MapPinIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/site/container";
import { FilterPanel, MobileFilters, SortSelect } from "@/components/site/filters";
import { Guilloche } from "@/components/site/guilloche";
import { JobList } from "@/components/site/job-row";
import { Stamp } from "@/components/site/stamp";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { FIELD_KEYS } from "@/lib/scoring/fields";
import { RULES_UPDATED_AT } from "@/lib/scoring/occupations";
import { fieldCounts, PAGE_SIZE, searchJobs, siteStats } from "@/lib/site/queries";
import { filterQuery, parseFilters, searchHref, type SearchParams } from "@/lib/site/search";
import { jsonLdScript, siteJsonLd } from "@/lib/site/structured-data";
import { utmQuery } from "@/lib/site/utm";

// Filtered, paged and tagged addresses all point search engines at the home page.
export const metadata: Metadata = { alternates: { canonical: "/" } };

const tagsFrom = (sp: SearchParams) => utmQuery({ get: (k) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? null });

/** The search form on the hero band. A plain GET form: it works before (and without) JavaScript. */
async function HeroSearch({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  // Keep the panel's filters and a post's tags when searching again; the two typed fields come from the inputs.
  const kept = [...new URLSearchParams(filterQuery({ ...filters, q: undefined, location: undefined }, 1, tagsFrom(sp)))];
  return <SearchForm q={filters.q} location={filters.location} kept={kept} />;
}

function SearchForm({ q, location, kept = [] }: { q?: string; location?: string; kept?: [string, string][] }) {
  // text-ink: the hero band sets white text, which the inputs would otherwise inherit.
  return (
    <form action="/" method="get" role="search" aria-label="Search jobs" className="grid gap-2 rounded-xl bg-white p-2 text-ink shadow-[0_1px_0_rgba(255,255,255,0.12)] sm:grid-cols-[1fr_15rem_auto]">
      {kept.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <InputGroup className="h-12 border-line">
        <InputGroupAddon>
          <SearchIcon aria-hidden className="text-ink-soft" />
        </InputGroupAddon>
        <InputGroupInput name="q" type="search" defaultValue={q} placeholder="Job title or employer" aria-label="Job title or employer" className="text-base" />
      </InputGroup>
      <InputGroup className="h-12 border-line">
        <InputGroupAddon>
          <MapPinIcon aria-hidden className="text-ink-soft" />
        </InputGroupAddon>
        <InputGroupInput name="location" defaultValue={location} placeholder="Town or city" aria-label="Town or city" className="text-base" />
      </InputGroup>
      <button type="submit" className="h-12 rounded-lg bg-teal px-6 font-semibold text-white hover:bg-teal/90">
        Search jobs
      </button>
    </form>
  );
}

async function Stats() {
  const stats = await siteStats();
  const updated = stats.updatedAt
    ? new Date(stats.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })
    : null;
  return (
    <p className="mt-4 text-[0.94rem] text-white/70 tabular">
      {stats.jobs.toLocaleString("en-GB")} live jobs from {stats.sponsors.toLocaleString("en-GB")} licensed sponsors.
      {updated ? ` Updated ${updated}.` : ""}
    </p>
  );
}

function Hero({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <section aria-labelledby="hero" className="relative overflow-hidden bg-ink-deep text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(siteJsonLd()) }} />
      {/* The passport data page: fine guilloche lines behind the search. */}
      <Guilloche className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full text-teal-wash/15" />
      <Container className="relative py-10 sm:py-14">
        <h1 id="hero" className="max-w-[42rem] font-expanded text-[2rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-[2.6rem]">
          Graduate jobs at UK employers licensed to sponsor visas
        </h1>
        <p className="mt-3 max-w-[38rem] text-[1.05rem] leading-relaxed text-white/80">
          We read every ad in full and check it against the Skilled Worker rules: the sponsor licence, what the ad says about
          sponsorship, the contract, the hours, the occupation and the salary.
        </p>
        <div className="mt-7 max-w-[56rem]">
          <Suspense fallback={<SearchForm />}>
            <HeroSearch searchParams={searchParams} />
          </Suspense>
        </div>
        <Suspense fallback={<p className="mt-4 h-6" />}>
          <Stats />
        </Suspense>
      </Container>
    </section>
  );
}

/** Page numbers around the current one: 1 … 4 5 6 … 100. */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (["gap", p] as const) : [p]));
}

async function Results({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  // A visitor from a tagged post keeps the tag on every link here, so their apply click is credited to it.
  const utm = tagsFrom(sp);
  const [{ items, total }, counts] = await Promise.all([searchJobs(filters), fieldCounts()]);
  // Fields with nothing to show stay out of the list, unless it's the one selected.
  const fields = FIELD_KEYS.filter((k) => k !== "other" && ((counts[k] ?? 0) > 0 || filters.field === k));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const panel = { filters, counts, fields, utm };
  // "for “nurse” in Leeds", "for “nurse”", "in Leeds"
  const searched = [filters.q && `for “${filters.q}”`, filters.location && `in ${filters.location}`].filter(Boolean).join(" ");

  return (
    <div className="lg:grid lg:grid-cols-[15.5rem_1fr] lg:gap-10">
      <aside aria-label="Filters" className="hidden lg:block">
        <div className="sticky top-6 space-y-8">
          <FilterPanel {...panel} />
          <StampKey />
        </div>
      </aside>

      <section aria-labelledby="results" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="results" className="text-[0.94rem] text-ink-soft" aria-live="polite">
            <strong className="font-semibold text-ink tabular">{total.toLocaleString("en-GB")}</strong> {total === 1 ? "job" : "jobs"}
            {searched ? ` ${searched}` : ""}
            {filters.show === "passes" ? " that pass our checks" : " at licensed sponsors"}
          </h2>
          <div className="flex items-center gap-2">
            <MobileFilters {...panel} total={total} />
            <SortSelect filters={filters} utm={utm} />
          </div>
        </div>

        {items.length > 0 ? (
          <div className="mt-4">
            <JobList jobs={items} query={utm} />
          </div>
        ) : (
          <Empty className="mt-4 border border-dashed border-line bg-white">
            <EmptyHeader>
              <EmptyTitle>No jobs match this search</EmptyTitle>
              <EmptyDescription>Try a nearby town, a broader job title, or include jobs to check with the employer.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center gap-3">
              <Link className="font-semibold text-teal underline-offset-4 hover:underline" href={searchHref({ ...filters, show: "all" }, 1, utm)}>
                Include jobs to check with the employer
              </Link>
              <Link className="font-semibold text-teal underline-offset-4 hover:underline" href={searchHref(parseFilters({}), 1, utm)}>
                Clear the search
              </Link>
            </EmptyContent>
          </Empty>
        )}

        {pages > 1 ? (
          <Pagination className="mt-6">
            <PaginationContent className="flex-wrap">
              {filters.page > 1 ? (
                <PaginationItem>
                  <PaginationPrevious href={searchHref(filters, filters.page - 1, utm)} />
                </PaginationItem>
              ) : null}
              {pageWindow(filters.page, pages).map((p, i) =>
                p === "gap" ? (
                  <PaginationItem key={`gap-${i}`} className="hidden sm:block">
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p} className={p === filters.page ? undefined : "hidden sm:block"}>
                    <PaginationLink href={searchHref(filters, p, utm)} isActive={p === filters.page} className="tabular">
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              {filters.page < pages ? (
                <PaginationItem>
                  <PaginationNext href={searchHref(filters, filters.page + 1, utm)} />
                </PaginationItem>
              ) : null}
            </PaginationContent>
          </Pagination>
        ) : null}

        <div className="mt-10 lg:hidden">
          <StampKey />
        </div>
      </section>
    </div>
  );
}

const rulesDate = new Date(RULES_UPDATED_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

function StampKey() {
  return (
    <aside aria-labelledby="key" className="rounded-lg border border-line bg-white p-4">
      <h2 id="key" className="font-semibold">What the stamps mean</h2>
      <dl className="mt-3 space-y-3 text-sm">
        {(
          [
            ["sponsorship_mentioned", "The ad says sponsorship is available, and every check we can make passes."],
            ["likely_eligible", "Licensed sponsor, eligible occupation, and the salary meets the new-entrant rate. The ad doesn't mention sponsorship."],
            ["check_with_employer", "Licensed sponsor, but we couldn't confirm everything from the ad, often the salary."],
          ] as const
        ).map(([s, text]) => (
          <div key={s}>
            <dt>
              <Stamp status={s} />
            </dt>
            <dd className="mt-1.5 text-ink-soft">{text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-soft">
        Rules as of {rulesDate}.{" "}
        <Link className="underline underline-offset-2" href="/how-we-check">
          How we check
        </Link>
      </p>
    </aside>
  );
}

function ResultsFallback() {
  return (
    <div aria-busy="true" className="lg:grid lg:grid-cols-[15.5rem_1fr] lg:gap-10">
      <div className="hidden space-y-2 lg:block">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-7 bg-line/50" />
        ))}
      </div>
      <div>
        <Skeleton className="h-10 w-64 bg-line/50" />
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-white">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex gap-4 px-5 py-4">
              <Skeleton className="size-11 rounded-lg bg-line/50" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4 bg-line/60" />
                <Skeleton className="h-3 w-1/2 bg-line/40" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    <>
      <Hero searchParams={props.searchParams} />
      <Container className="py-8 sm:py-10">
        <Suspense fallback={<ResultsFallback />}>
          <Results searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </>
  );
}
