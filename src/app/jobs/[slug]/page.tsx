import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BADGE, formatClosing, formatContract, formatSalary, SECTOR_LABEL } from "@/components/site/format";
import { SponsorshipCheck } from "@/components/site/sponsorship-check";
import { Stamp } from "@/components/site/stamp";
import { OutboundLink } from "@/components/site/outbound-link";
import { FIELD_LABEL } from "@/lib/scoring/fields";
import { RULES_UPDATED_AT } from "@/lib/scoring/occupations";
import { getJob, recentJobSlugs } from "@/lib/site/queries";

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
  return {
    title: `${job.title} at ${job.employerName}`,
    description: `${BADGE[job.sponsorability].label}: ${job.title} at ${job.employerName}${job.locationText ? `, ${job.locationText}` : ""}. See how this job measures up to the Skilled Worker visa rules.`,
  };
}

const rulesDate = new Date(RULES_UPDATED_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

async function JobContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) notFound();

  const salary = formatSalary(job.salaryAnnualMin, job.salaryAnnualMax);
  const closing = formatClosing(job.closingDate);
  const source = job.ats === "nhs_jobs" ? "NHS Jobs" : `${job.employerName}'s careers site`;

  return (
    <article>
      <h1 className="font-semi-expanded text-[1.65rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[2rem]">{job.title}</h1>
      <p className="mt-2 text-[1.05rem]">
        {job.sponsor ? (
          <Link href={`/sponsors/${job.sponsor.slug}`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-teal">
            {job.employerName}
          </Link>
        ) : (
          <span className="font-semibold">{job.employerName}</span>
        )}
        {job.locationText ? <span className="text-ink-soft">, {job.locationText}</span> : null}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-4 text-[0.94rem] tabular sm:grid-cols-3">
        <div>
          <dt className="text-ink-soft">Salary</dt>
          <dd className="font-semibold">{salary ? `${salary} a year` : "Not shown"}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Field</dt>
          <dd className="font-semibold">{job.field ? (FIELD_LABEL[job.field] ?? job.field) : "Not classified"}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Employer&apos;s industry</dt>
          <dd className="font-semibold">{job.sector ? SECTOR_LABEL[job.sector] : "Not known"}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Contract</dt>
          <dd className="font-semibold">{formatContract(job.employmentType) ?? (job.isRemote ? "Remote" : "Not shown")}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Closing date</dt>
          <dd className="font-semibold">{closing ? closing.replace("Closes ", "") : "Not shown"}</dd>
        </div>
      </dl>

      <section aria-labelledby="check" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="check" className="font-semi-expanded text-xl font-bold">Sponsorship check</h2>
          <Stamp status={job.sponsorability} size="lg" />
        </div>
        <p className="mt-2 text-ink-soft">{BADGE[job.sponsorability].summary}</p>
        <div className="mt-4">
          <SponsorshipCheck reasons={job.reasons} />
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Checked against the Skilled Worker rules for new entrants as of {rulesDate}. Ask the employer to confirm they&apos;ll
          sponsor this role before you apply. This is not immigration advice.
        </p>
      </section>

      <div className="mt-8">
        <OutboundLink
          jobId={job.id}
          medium="job_page"
          aria-describedby="apply-note"
          className="flex min-h-12 w-full items-center justify-center rounded-md bg-ink px-6 py-3 text-center font-semibold text-white hover:bg-ink/90 sm:inline-flex sm:w-auto"
        >
          Apply for this job
        </OutboundLink>
        <p id="apply-note" className="mt-2 text-sm text-ink-soft">Opens {source} in a new tab.</p>
      </div>

      {job.snippet ? (
        <section aria-labelledby="about" className="mt-10">
          <h2 id="about" className="font-semi-expanded text-xl font-bold">About the role</h2>
          <p className="mt-3 max-w-[38rem] leading-relaxed text-ink-soft">{job.snippet}</p>
          <p className="mt-3 text-[0.94rem]">
            <OutboundLink jobId={job.id} medium="read_more" className="underline underline-offset-2">
              Read the full ad on {source}
              <span className="sr-only"> (opens in a new tab)</span>
            </OutboundLink>
          </p>
        </section>
      ) : null}
    </article>
  );
}

function JobFallback() {
  return (
    <div aria-busy="true">
      <div className="h-8 w-4/5 rounded bg-line/60" />
      <div className="mt-3 h-5 w-1/2 rounded bg-line/40" />
      <div className="mt-6 h-16 rounded bg-white" />
      <div className="mt-8 h-56 rounded-lg bg-white" />
    </div>
  );
}

export default function JobPage(props: PageProps<"/jobs/[slug]">) {
  return (
    <>
      <p className="mb-5 text-[0.94rem]">
        <Link href="/" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">All jobs</Link>
      </p>
      <Suspense fallback={<JobFallback />}>
        <JobContent params={props.params} />
      </Suspense>
    </>
  );
}
