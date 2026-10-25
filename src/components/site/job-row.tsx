import Link from "next/link";
import type { JobListItem } from "@/lib/site/queries";
import { formatAdded, formatClosing, formatSalary } from "./format";
import { Stamp } from "./stamp";

export function JobRow({ job, query }: { job: JobListItem; query?: string }) {
  const salary = formatSalary(job.salaryAnnualMin, job.salaryAnnualMax);
  const closing = formatClosing(job.closingDate);
  return (
    <li className="group relative py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.05rem] leading-snug font-semibold text-ink">
            <Link href={`/jobs/${job.slug}${query ? `?${query}` : ""}`} className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-teal group-hover:underline-offset-4">
              {job.title}
            </Link>
          </h3>
          <p className="mt-1 text-[0.94rem] text-ink-soft">
            {job.employerName}
            {job.locationText ? <span className="block truncate">{job.locationText}</span> : null}
          </p>
        </div>
        <Stamp status={job.sponsorability} className="mt-0.5 shrink-0" />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft tabular">
        {salary ? <span className="font-semibold text-ink">{salary} a year</span> : <span>Salary not shown</span>}
        {job.isGradScheme ? <span className="text-teal">Graduate scheme</span> : null}
        {closing ? <span>{closing}</span> : <span>{formatAdded(job.firstSeenAt)}</span>}
      </p>
    </li>
  );
}

/** `query`: UTM tags to carry on to the job page (see lib/site/utm). */
export function JobList({ jobs, query }: { jobs: JobListItem[]; query?: string }) {
  return <ul className="divide-y divide-line border-y border-line">{jobs.map((j) => <JobRow key={j.slug} job={j} query={query} />)}</ul>;
}
