import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BADGE, formatAdded, formatClosing, formatContract, formatSalary, SECTOR_LABEL } from "@/components/site/format";
import { SponsorshipCheck } from "@/components/site/sponsorship-check";
import { Stamp } from "@/components/site/stamp";
import { OutboundLink } from "@/components/site/outbound-link";
import { Page } from "@/components/site/container";
import { JobList } from "@/components/site/job-row";
import { Monogram } from "@/components/site/monogram";
import { SaveButton } from "@/components/site/saved-jobs";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";

import { FIELD_LABEL } from "@/lib/scoring/fields";
import { RULES_UPDATED_AT } from "@/lib/scoring/occupations";
import { getJob, getSponsor, recentJobSlugs, sponsorIdFromSlug } from "@/lib/site/queries";
import { jobPostingJsonLd, jsonLdScript } from "@/lib/site/structured-data";

export async function generateStaticParams() {
  const slugs = await recentJobSlugs(50);
  // Cache Components needs at least one param; unknown slugs render on first visit.
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__none__" }];
}

export async function generateMetadata(props: PageProps<"/jobs/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const job = await getJob(slug);
  // The page streams before the lookup finishes, so a 404 status can't be sent; keep it out of search instead.
  if (!job) return { title: "Job not found", robots: { index: false } };
  const title = `${job.title} at ${job.employerName}`;
  const description = `${BADGE[job.sponsorability].label}: ${job.title} at ${job.employerName}${job.locationText ? `, ${job.locationText}` : ""}. See how this job measures up to the Skilled Worker visa rules.`;
  return {
    title,
    description,
    // Post links carry UTM tags; search engines should index the plain address.
    alternates: { canonical: `/jobs/${job.slug}` },
    openGraph: { type: "article", title, description, url: `/jobs/${job.slug}` },
    // Not-sponsorable and closed jobs stay reachable from links but out of search results.
    ...(job.sponsorability === "ineligible" || job.closed ? { robots: { index: false, follow: true } } : {}),
  };
}

const rulesDate = new Date(RULES_UPDATED_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

async function MoreAtEmployer({ sponsorSlug, exclude, employer }: { sponsorSlug: string; exclude: string; employer: string }) {
  const id = sponsorIdFromSlug(sponsorSlug);
  const sponsor = id ? await getSponsor(id) : null;
  const others = (sponsor?.jobs ?? []).filter((j) => j.slug !== exclude).slice(0, 4);
  if (others.length === 0) return null;
  return (
    <section aria-labelledby="more" className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="more" className="font-semi-expanded text-xl font-bold">More jobs at {employer}</h2>
        <Link href={`/sponsors/${sponsorSlug}`} className="text-[0.94rem] font-semibold text-teal underline-offset-4 hover:underline">
          See all {sponsor!.jobs.length.toLocaleString("en-GB")}
        </Link>
      </div>
      <div className="mt-4">
        <JobList jobs={others} showEmployer={false} />
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}

async function JobContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) notFound();

  const salary = formatSalary(job.salaryAnnualMin, job.salaryAnnualMax);
  const closing = formatClosing(job.closingDate);
  const source = job.ats === "nhs_jobs" ? "NHS Jobs" : `${job.employerName}'s careers site`;
  const fieldLabel = job.field ? FIELD_LABEL[job.field] : null;

  return (
    <>
      {job.sponsorability !== "ineligible" && !job.closed ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jobPostingJsonLd(job)) }} />
      ) : null}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Jobs</BreadcrumbLink>
          </BreadcrumbItem>
          {fieldLabel && job.field !== "other" ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/?field=${job.field}`} />}>{fieldLabel}</BreadcrumbLink>
              </BreadcrumbItem>
            </>
          ) : null}
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{job.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
        <article className="min-w-0">
          <header className="flex gap-4">
            <Monogram name={job.employerName} size="lg" className="hidden sm:grid" />
            <div className="min-w-0">
              <h1 className="font-semi-expanded text-[1.65rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[2rem]">{job.title}</h1>
              <p className="mt-1.5 text-[1.05rem]">
                {job.sponsor ? (
                  <Link href={`/sponsors/${job.sponsor.slug}`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-teal">
                    {job.employerName}
                  </Link>
                ) : (
                  <span className="font-semibold">{job.employerName}</span>
                )}
                {job.locationText ? <span className="text-ink-soft">, {job.locationText}</span> : null}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Stamp status={job.sponsorability} className="lg:hidden" />
                {job.isGradScheme ? <Badge className="bg-teal-wash text-teal">Graduate scheme</Badge> : null}
                {job.isRemote ? <Badge variant="outline">Remote</Badge> : null}
                {job.isNew ? <Badge variant="outline" className="border-teal/40 text-teal">New</Badge> : null}
              </div>
            </div>
          </header>

          {job.closed ? (
            <p role="status" className="mt-6 rounded-lg border border-line bg-paper p-4 text-[0.94rem]">
              <strong>This job has closed.</strong> The closing date was {closing ? closing.replace("Closes ", "") : "earlier"}, so applications
              have ended.{" "}
              <Link href={job.field && job.field !== "other" ? `/?field=${job.field}` : "/"} className="font-semibold text-teal underline-offset-4 hover:underline">
                See open {fieldLabel && job.field !== "other" ? `${fieldLabel} ` : ""}jobs
              </Link>
            </p>
          ) : null}

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-line bg-white p-5 text-[0.94rem] tabular sm:grid-cols-3">
            <Fact label="Salary">{salary ? `${salary} a year` : "Not shown"}</Fact>
            <Fact label="Closing date">{closing ? closing.replace("Closes ", "") : "Not shown"}</Fact>
            <Fact label="Contract">{formatContract(job.employmentType) ?? (job.isRemote ? "Remote" : "Not shown")}</Fact>
            <Fact label="Field">{fieldLabel ?? "Not classified"}</Fact>
            <Fact label="Employer's industry">{job.sector ? SECTOR_LABEL[job.sector] : "Not known"}</Fact>
            <Fact label="Added">{formatAdded(job.firstSeenAt).replace("Added ", "")}</Fact>
          </dl>

          <section aria-labelledby="check" className="mt-10">
            <h2 id="check" className="font-semi-expanded text-xl font-bold">Sponsorship check</h2>
            <p className="mt-2 text-ink-soft">{BADGE[job.sponsorability].summary}</p>
            <div className="mt-4">
              <SponsorshipCheck reasons={job.reasons} />
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              Checked against the Skilled Worker rules for new entrants as of {rulesDate}. Ask the employer to confirm they&apos;ll sponsor
              this role before you apply. This is not immigration advice.
            </p>
          </section>

          {job.snippet ? (
            <section aria-labelledby="about" className="mt-10">
              <h2 id="about" className="font-semi-expanded text-xl font-bold">About the role</h2>
              <p className="mt-3 max-w-[40rem] leading-relaxed text-ink-soft">{job.snippet}</p>
              <p className="mt-3 text-[0.94rem]">
                <OutboundLink jobId={job.id} medium="read_more" className="font-semibold text-teal underline underline-offset-2">
                  Read the full ad on {source}
                  <span className="sr-only"> (opens in a new tab)</span>
                </OutboundLink>
              </p>
            </section>
          ) : null}

          {job.sponsor ? <MoreAtEmployer sponsorSlug={job.sponsor.slug} exclude={job.slug} employer={job.employerName} /> : null}
        </article>

        {/* Desktop: the decision and the action stay in view while reading. */}
        <aside aria-label="Apply" className="hidden lg:block">
          <div className="sticky top-6 rounded-lg border border-line bg-white p-5">
            <Stamp status={job.sponsorability} size="lg" />
            <p className="mt-3 text-sm text-ink-soft">{BADGE[job.sponsorability].summary}</p>
            <dl className="mt-4 space-y-3 border-t border-line pt-4 text-[0.94rem] tabular">
              <Fact label="Salary">{salary ? `${salary} a year` : "Not shown"}</Fact>
              <Fact label="Closing date">{closing ? closing.replace("Closes ", "") : "Not shown"}</Fact>
            </dl>
            {job.closed ? (
              <p className="mt-5 rounded-md border border-line bg-paper px-4 py-3 text-center font-semibold text-ink-soft">Applications have closed</p>
            ) : (
              <>
                <OutboundLink
                  jobId={job.id}
                  medium="job_page"
                  aria-describedby="apply-note"
                  className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-ink px-6 font-semibold text-white hover:bg-ink/90"
                >
                  Apply for this job
                </OutboundLink>
                <p id="apply-note" className="mt-2 text-center text-sm text-ink-soft">Opens {source} in a new tab.</p>
              </>
            )}
            <SaveButton jobId={job.id} title={job.title} variant="full" className="mt-4" />
            {job.sponsor ? (
              <p className="mt-4 border-t border-line pt-4 text-sm">
                <Link href={`/sponsors/${job.sponsor.slug}`} className="font-semibold text-teal underline-offset-4 hover:underline">
                  {job.employerName}&apos;s sponsor licence
                </Link>
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Phones: the apply button stays at the bottom of the screen (not for closed jobs). */}
      {job.closed ? null : (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="flex gap-2">
            <OutboundLink
              jobId={job.id}
              medium="job_page"
              aria-describedby="apply-note-mobile"
              className="flex h-12 flex-1 items-center justify-center rounded-md bg-ink px-6 font-semibold text-white hover:bg-ink/90"
            >
              Apply for this job
            </OutboundLink>
            <SaveButton jobId={job.id} title={job.title} className="size-12 shrink-0 rounded-md border border-line bg-white" />
          </div>
          <p id="apply-note-mobile" className="mt-1.5 text-center text-xs text-ink-soft">Opens {source} in a new tab.</p>
        </div>
      )}
    </>
  );
}

function JobFallback() {
  return (
    <div aria-busy="true" className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
      <div>
        <Skeleton className="h-4 w-48 bg-line/50" />
        <Skeleton className="mt-6 h-9 w-4/5 bg-line/60" />
        <Skeleton className="mt-3 h-5 w-1/2 bg-line/40" />
        <Skeleton className="mt-6 h-28 bg-white" />
        <Skeleton className="mt-10 h-56 bg-white" />
      </div>
      <Skeleton className="hidden h-72 bg-white lg:block" />
    </div>
  );
}

export default function JobPage(props: PageProps<"/jobs/[slug]">) {
  return (
    // Bottom padding on phones keeps the fixed apply bar from covering the end of the page.
    <Page className="pb-36 lg:pb-16">
      <Suspense fallback={<JobFallback />}>
        <JobContent params={props.params} />
      </Suspense>
    </Page>
  );
}
