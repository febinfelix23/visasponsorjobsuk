import { CalendarClockIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";
import { formatSalary, shortLocation } from "@/components/site/format";
import { Monogram } from "@/components/site/monogram";
import { Stamp } from "@/components/site/stamp";
import { Badge } from "@/components/ui/badge";
import type { SavedJob } from "@/lib/account/saved";
import { cn } from "@/lib/utils";
import { RemoveSaved, StatusSelect } from "./tracker-controls";

/** "Closes today", "Closes in 3 days", or the date; the last three days are flagged. */
function Closing({ job }: { job: SavedJob }) {
  if (job.closed) return <Badge variant="outline" className="border-line text-ink-soft">Closed</Badge>;
  if (job.closesInDays === null) return null;
  const d = job.closesInDays;
  const soon = d <= 3;
  const text =
    d === 0
      ? "Closes today"
      : d === 1
        ? "Closes tomorrow"
        : d <= 14
          ? `Closes in ${d} days`
          : `Closes ${new Date(`${job.closingDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  return (
    <span className={cn("inline-flex items-center gap-1.5", soon && "font-semibold text-amber")}>
      <CalendarClockIcon aria-hidden className="size-3.5" />
      {text}
    </span>
  );
}

export function SavedRow({ job }: { job: SavedJob }) {
  const salary = formatSalary(job.salaryAnnualMin, job.salaryAnnualMax);
  const place = shortLocation(job.locationText);
  return (
    <li className={cn("flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5", job.closed && "bg-paper/60")}>
      <div className="flex min-w-0 flex-1 gap-3.5 sm:gap-4">
        <Monogram name={job.employerName} className={cn("mt-0.5", job.closed && "opacity-60")} />
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">
            <Link href={`/jobs/${job.slug}`} className="underline-offset-4 hover:underline hover:decoration-teal">
              {job.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-[0.94rem] text-ink-soft">{job.employerName}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-soft tabular">
            {place ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon aria-hidden className="size-3.5" />
                {place}
              </span>
            ) : null}
            {salary ? <span className="font-semibold text-ink">{salary} a year</span> : null}
            <Closing job={job} />
            <Stamp status={job.sponsorability} />
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 pl-[3.6rem] sm:pl-0">
        <StatusSelect jobId={job.id} status={job.status} title={job.title} />
        <RemoveSaved jobId={job.id} title={job.title} />
      </div>
    </li>
  );
}

