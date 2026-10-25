"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Channel attribution for apply clicks. Posts link to our pages with UTM tags; the tags
 * are kept for the visit (sessionStorage) and passed on to /out, which counts the click.
 * Nothing leaves the browser except on that click.
 */
const KEY = "utm";
const UTM = ["utm_source", "utm_medium", "utm_campaign"] as const;

function fromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.get("utm_source")) return null;
  const kept = new URLSearchParams();
  for (const k of UTM) {
    const v = params.get(k);
    if (v) kept.set(k, v);
  }
  return kept.toString();
}

function readUtm(): string | null {
  const current = fromUrl();
  if (current) return current;
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const subscribe = () => () => {};

/** Remembers the channel a visitor arrived from. Rendered once, in the layout. */
export function UtmCapture() {
  useEffect(() => {
    const current = fromUrl();
    if (!current) return;
    try {
      sessionStorage.setItem(KEY, current);
    } catch {
      // Private browsing or blocked storage: links on this page still carry the tags.
    }
  }, []);
  return null;
}

/** Link to a job's original ad, through /out, in a new tab. */
export function OutboundLink({ jobId, medium, ...props }: { jobId: number; medium: string } & Omit<React.ComponentProps<"a">, "href" | "target" | "rel">) {
  const utm = useSyncExternalStore(subscribe, readUtm, () => null);
  const href = `/out/${jobId}?${utm ?? new URLSearchParams({ utm_source: "site", utm_medium: medium }).toString()}`;
  return <a {...props} href={href} target="_blank" rel="nofollow noopener" />;
}
