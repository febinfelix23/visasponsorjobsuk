import type { Metadata } from "next";
import { JobList } from "@/components/site/job-row";
import { doctorJobs } from "@/lib/site/queries";

export const metadata: Metadata = {
  title: "Junior doctor jobs with visa sponsorship",
  description: "Doctors' posts at NHS employers that can sponsor visas, and where national training recruitment happens for UK medical graduates.",
  alternates: { canonical: "/junior-doctors" },
};

const OFFICIAL = [
  {
    name: "UK Foundation Programme",
    href: "https://foundationprogramme.nhs.uk",
    what: "The two-year programme after medical school. Places are allocated nationally, not advertised job by job.",
  },
  {
    name: "Oriel",
    href: "https://www.oriel.nhs.uk",
    what: "Applications for core and specialty training. Each round has fixed application windows, so check dates there.",
  },
  {
    name: "Health and Care Worker visa",
    href: "https://www.gov.uk/health-care-worker-visa",
    what: "The Skilled Worker route for eligible health jobs, including doctors, with its own fees and conditions.",
  },
];

export default async function JuniorDoctorsPage() {
  const posts = await doctorJobs();
  return (
    <>
      <h1 className="font-expanded text-[1.9rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-[2.4rem]">
        Junior doctor jobs at sponsoring NHS employers
      </h1>
      <p className="mt-4 max-w-[34rem] text-[1.05rem] leading-relaxed text-ink-soft">
        Doctors&apos; jobs reach UK medical graduates in two ways. Training posts go through national recruitment. Other posts,
        such as clinical fellow and trust grade roles, are advertised one by one on NHS Jobs. We list those below.
      </p>

      <section aria-labelledby="training" className="mt-8">
        <h2 id="training" className="font-semi-expanded text-xl font-bold">National training recruitment</h2>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">
          {OFFICIAL.map((o) => (
            <li key={o.href} className="p-4">
              <a className="font-semibold underline decoration-line underline-offset-4 hover:decoration-teal" href={o.href}>
                {o.name}
              </a>
              <p className="mt-1 text-[0.94rem] text-ink-soft">{o.what}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="posts" className="mt-10">
        <h2 id="posts" className="font-semi-expanded text-xl font-bold">Junior doctors&apos; posts on NHS Jobs</h2>
        <p className="mt-2 text-ink-soft">
          Foundation, clinical fellow, trust grade, core trainee and specialty doctor posts. NHS doctors are paid on national
          pay scales, which the Skilled Worker rules accept for these occupations.
        </p>
        {posts.length > 0 ? (
          <div className="mt-3"><JobList jobs={posts} /></div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-line bg-white p-5 text-ink-soft">
            No junior doctors&apos; posts listed right now. We check NHS Jobs every day.
          </p>
        )}
      </section>
    </>
  );
}
