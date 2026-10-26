import Link from "next/link";
import { Page } from "@/components/site/container";

export default function NotFound() {
  return (
    <Page>
      <div className="max-w-[34rem]">
        <h1 className="font-expanded text-[1.9rem] leading-tight font-extrabold tracking-tight">This page isn&apos;t here</h1>
        <p className="mt-3 text-ink-soft">
          The job may have closed, or the link may be wrong. Closed jobs come off the site after two checks of the employer&apos;s board.
        </p>
        <p className="mt-5">
          <Link href="/" className="inline-flex h-11 items-center rounded-md bg-ink px-4 font-semibold text-white hover:bg-ink/90">
            Search current jobs
          </Link>
        </p>
      </div>
    </Page>
  );
}
