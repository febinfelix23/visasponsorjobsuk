import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SavedRow } from "@/components/account/saved-row";
import { Page } from "@/components/site/container";
import { Skeleton } from "@/components/ui/skeleton";
import { type ApplicationStatus, isStatus, listSaved, STATUSES } from "@/lib/account/saved";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your jobs", robots: { index: false, follow: false } };

async function Jobs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const user = await requireUser("/account/jobs");
  const raw = (await searchParams).status;
  const filter: ApplicationStatus | null = isStatus(raw) ? raw : null;
  const { jobs, counts } = await listSaved(user.id);
  const shown = filter ? jobs.filter((j) => j.status === filter) : jobs;
  const label = (s: ApplicationStatus) => STATUSES.find((x) => x.value === s)!.label;

  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
        <p className="font-semibold">No saved jobs yet</p>
        <p className="mx-auto mt-1 max-w-[30rem] text-ink-soft">Tap the bookmark on any job to keep it here, then track it from saved to offer.</p>
        <Link href="/" className="mt-5 inline-flex h-11 items-center rounded-lg bg-ink px-5 font-semibold text-white hover:bg-ink/90">
          Search jobs
        </Link>
      </div>
    );
  }

  return (
    <>
      <nav aria-label="Filter by status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {[null, ...STATUSES.map((s) => s.value)].map((s) => {
          const current = s === filter;
          const n = s ? counts[s] : jobs.length;
          return (
            <Link
              key={s ?? "all"}
              href={s ? `/account/jobs?status=${s}` : "/account/jobs"}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-baseline gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.94rem] font-semibold",
                current ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink-soft",
              )}
            >
              {s ? label(s) : "All"}
              <span className={cn("text-xs tabular", current ? "text-white/70" : "text-ink-soft")}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {shown.length > 0 ? (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
          {shown.map((j) => (
            <SavedRow key={j.id} job={j} />
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-line bg-white p-6 text-center text-ink-soft">
          No jobs marked &ldquo;{label(filter!)}&rdquo;.{" "}
          <Link href="/account/jobs" className="font-semibold text-teal underline-offset-4 hover:underline">
            Show all
          </Link>
        </p>
      )}
    </>
  );
}

export default function SavedJobsPage(props: PageProps<"/account/jobs">) {
  return (
    <Page>
      <div className="max-w-4xl">
        <p className="mb-3 text-[0.94rem]">
          <Link href="/account" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            Your account
          </Link>
        </p>
        <h1 className="font-expanded text-[1.9rem] leading-tight font-extrabold tracking-tight">Your jobs</h1>
        <p className="mt-2 mb-6 text-ink-soft">Jobs you&apos;ve saved, closing soonest first, and where each application stands.</p>
        <Suspense fallback={<Skeleton className="h-80 bg-white" />}>
          <Jobs searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Page>
  );
}
