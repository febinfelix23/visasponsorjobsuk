"use client";

import { useSyncExternalStore } from "react";
import { utmQuery } from "@/lib/site/utm";

/**
 * Channel attribution for apply clicks. Posts link to our pages with UTM tags in the URL,
 * the home page carries them on to job links, and this passes them to /out, which counts
 * the click. Nothing is stored in the visitor's browser.
 */
const readUtm = () => utmQuery(new URLSearchParams(window.location.search));
const subscribe = () => () => {};

/** Link to a job's original ad, through /out, in a new tab. */
export function OutboundLink({ jobId, medium, ...props }: { jobId: number; medium: string } & Omit<React.ComponentProps<"a">, "href" | "target" | "rel">) {
  const utm = useSyncExternalStore(subscribe, readUtm, () => "");
  const href = `/out/${jobId}?${utm || new URLSearchParams({ utm_source: "site", utm_medium: medium }).toString()}`;
  return <a {...props} href={href} target="_blank" rel="nofollow noopener" />;
}
