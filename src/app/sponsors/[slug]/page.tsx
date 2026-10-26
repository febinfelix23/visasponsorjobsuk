import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SECTOR_LABEL } from "@/components/site/format";
import { JobList } from "@/components/site/job-row";
import { Monogram } from "@/components/site/monogram";
import { getSponsor, sponsorIdFromSlug, sponsorSlug, topSponsorIds } from "@/lib/site/queries";
import { Page } from "@/components/site/container";

export async function generateStaticParams() {
  const top = await topSponsorIds(30);
  return top.length > 0 ? top.map((s) => ({ slug: sponsorSlug(s) })) : [{ slug: "none-0" }];
}

export async function generateMetadata(props: PageProps<"/sponsors/[slug]">): Promise<Metadata> {
  const id = sponsorIdFromSlug((await props.params).slug);
  const sponsor = id ? await getSponsor(id) : null;
  if (!sponsor) return { title: "Sponsor not found", robots: { index: false } };
  return {
    title: `${sponsor.name}: licensed visa sponsor`,
    description: `${sponsor.name} (${sponsor.town}) on the UK register of licensed sponsors, with ${sponsor.jobs.length} live jobs checked against the Skilled Worker rules.`,
    alternates: { canonical: `/sponsors/${sponsorSlug(sponsor)}` },
  };
}

async function SponsorContent({ params }: { params: Promise<{ slug: string }> }) {
  const id = sponsorIdFromSlug((await params).slug);
  const sponsor = id ? await getSponsor(id) : null;
  if (!sponsor) notFound();
  const skilledWorker = sponsor.routes.includes("Skilled Worker");
  const active = sponsor.status === "active";

  return (
    <>
      <header className="flex items-center gap-4">
        <Monogram name={sponsor.name} size="lg" />
        <div className="min-w-0">
          <h1 className="font-semi-expanded text-[1.65rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[2rem]">{sponsor.name}</h1>
          <p className="mt-1 text-ink-soft">
            {sponsor.town}
            {sponsor.county ? `, ${sponsor.county}` : ""}
          </p>
        </div>
      </header>

      <section aria-labelledby="licence" className="mt-6 rounded-lg border border-line bg-white p-5">
        <h2 id="licence" className="font-semibold">On the register of licensed sponsors</h2>
        <dl className="mt-3 grid gap-3 text-[0.94rem] sm:grid-cols-3">
          <div>
            <dt className="text-ink-soft">Status</dt>
            <dd className={`font-semibold ${active ? "text-teal" : "text-stamp-red"}`}>{active ? "Listed" : "No longer listed"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Skilled Worker route</dt>
            <dd className="font-semibold">{skilledWorker ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Rating</dt>
            <dd className="font-semibold">{sponsor.rating ?? "Not shown"}</dd>
          </div>
        </dl>
        {sponsor.routes.length > 1 ? (
          <p className="mt-3 text-sm text-ink-soft">Licensed for: {sponsor.routes.join(", ")}.</p>
        ) : null}
        {sponsor.sector ? <p className="mt-1 text-sm text-ink-soft">Sector: {SECTOR_LABEL[sponsor.sector] ?? sponsor.sector}.</p> : null}
        <p className="mt-3 text-sm text-ink-soft">
          A licence means the employer can sponsor visas; it doesn&apos;t mean every role is sponsored. Check each job.
        </p>
      </section>

      <section aria-labelledby="jobs" className="mt-10">
        <h2 id="jobs" className="font-semi-expanded text-xl font-bold">
          {sponsor.jobs.length > 0 ? `${sponsor.jobs.length} live ${sponsor.jobs.length === 1 ? "job" : "jobs"}` : "No live jobs right now"}
        </h2>
        {sponsor.jobs.length > 0 ? (
          <div className="mt-3"><JobList jobs={sponsor.jobs} showEmployer={false} /></div>
        ) : (
          <p className="mt-2 text-ink-soft">We check this employer&apos;s job board twice a day. New roles appear here as soon as we find them.</p>
        )}
      </section>
    </>
  );
}

export default function SponsorPage(props: PageProps<"/sponsors/[slug]">) {
  return (
    <Page>
      <p className="mb-5 text-[0.94rem]">
        <Link href="/" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">All jobs</Link>
      </p>
      <Suspense fallback={<div aria-busy="true" className="h-64 rounded-lg bg-white" />}>
        <SponsorContent params={props.params} />
      </Suspense>
    </Page>
  );
}
