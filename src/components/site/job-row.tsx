import { BanknoteIcon, CalendarClockIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { JobListItem } from "@/lib/site/queries";
import { formatAdded, formatClosing, formatSalary, shortLocation } from "./format";
import { Monogram } from "./monogram";
import { SaveButton } from "./saved-jobs";
import { Stamp } from "./stamp";

export function JobRow({ job, query, showEmployer = true }: { job: JobListItem; query?: string; showEmployer?: boolean }) {
  const salary = formatSalary(job.salaryAnnualMin, job.salaryAnnualMax);
  const closing = formatClosing(job.closingDate);
  const place = shortLocation(job.locationText);
  return (
    <li className="group relative flex gap-3.5 px-4 py-4 transition-colors hover:bg-paper/70 sm:gap-4 sm:px-5">
      <Monogram name={job.employerName} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[1.05rem] leading-snug font-semibold text-ink">
            <Link
              href={`/jobs/${job.slug}${query ? `?${query}` : ""}`}
              className="after:absolute after:inset-0 group-hover:underline group-hover:decoration-teal group-hover:underline-offset-4"
            >
              {job.title}
            </Link>
          </h3>
          <div className="relative z-10 -mt-1.5 -mr-2 flex shrink-0 items-center gap-2">
            <Stamp status={job.sponsorability} className="hidden sm:inline-flex" />
            <SaveButton jobId={job.id} title={job.title} />
          </div>
        </div>
        {showEmployer ? <p className="mt-0.5 text-[0.94rem] text-ink-soft">{job.employerName}</p> : null}
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-soft tabular">
          {place ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPinIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{place}</span>
            </span>
          ) : null}
          <span className={`inline-flex items-center gap-1.5 ${salary ? "font-semibold text-ink" : ""}`}>
            <BanknoteIcon aria-hidden className="size-3.5 shrink-0" />
            {salary ? `${salary} a year` : "Salary not shown"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClockIcon aria-hidden className="size-3.5 shrink-0" />
            {closing ?? formatAdded(job.firstSeenAt)}
          </span>
          {job.isGradScheme ? <Badge className="bg-teal-wash text-teal">Graduate scheme</Badge> : null}
          {job.isNew ? <Badge variant="outline" className="border-teal/40 text-teal">New</Badge> : null}
        </p>
        <Stamp status={job.sponsorability} className="mt-3 sm:hidden" />
      </div>
    </li>
  );
}

/**
 * `query`: UTM tags to carry on to the job page (see lib/site/utm).
 * `showEmployer`: off where the whole list is one employer's (a sponsor page).
 */
export function JobList({ jobs, query, showEmployer }: { jobs: JobListItem[]; query?: string; showEmployer?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
      {jobs.map((j) => (
        <JobRow key={j.slug} job={j} query={query} showEmployer={showEmployer} />
      ))}
    </ul>
  );
}
