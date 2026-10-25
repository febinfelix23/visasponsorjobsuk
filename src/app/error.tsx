"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page fails to load, usually a brief database or network problem. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-[34rem]">
      <h1 className="font-expanded text-[1.9rem] leading-tight font-extrabold tracking-tight">This page didn&apos;t load</h1>
      <p className="mt-3 text-ink-soft">Something went wrong on our side, usually for a moment. Try again, or go back to the job search.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="inline-flex h-11 items-center rounded-md bg-ink px-4 font-semibold text-white hover:bg-ink/90">
          Try again
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-md border border-line bg-white px-4 font-semibold hover:border-ink">
          Search jobs
        </Link>
      </div>
    </div>
  );
}
