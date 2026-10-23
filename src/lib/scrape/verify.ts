import { coreName, fullName } from "@/lib/discovery/slugs";
import type { RawJob } from "./types";

const normaliseText = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/**
 * Phrases that identify the sponsor in job text: its full name always, and its
 * distinctive core only when that's unlikely to be an ordinary word ("allica" yes, "access" no).
 */
export function sponsorPhrases(names: (string | null)[]): string[] {
  const phrases = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    const full = fullName(name);
    if (full.replace(/ /g, "").length >= 3) phrases.add(full);
    const core = coreName(name);
    if (core && (core.split(" ").length >= 2 || core.length >= 7)) phrases.add(core);
  }
  return [...phrases];
}

export type SponsorCheck = "confirmed" | "insufficient" | "rejected";

/**
 * Does this board's UK job text show it belongs to the sponsor? A multi-word name in
 * any job is enough. A one-word name ("Academia") could be anyone's, so it must appear
 * in most of at least two UK jobs; with fewer jobs we wait ("insufficient").
 */
export function checkSponsorInJobs(jobs: RawJob[], names: (string | null)[]): SponsorCheck {
  const phrases = sponsorPhrases(names).map((p) => ` ${p} `);
  if (phrases.length === 0 || jobs.length === 0) return "insufficient";
  const texts = jobs.map((job) => normaliseText(`${job.title}\n${job.description ?? ""}`));
  const multi = phrases.filter((p) => p.trim().includes(" "));
  const single = phrases.filter((p) => !p.trim().includes(" "));
  if (texts.some((t) => multi.some((p) => t.includes(p)))) return "confirmed";
  const matching = texts.filter((t) => single.some((p) => t.includes(p))).length;
  if (matching === 0) return "rejected";
  if (jobs.length < 2) return "insufficient";
  return matching / jobs.length >= 0.5 ? "confirmed" : "rejected";
}

export function mentionsSponsor(jobs: RawJob[], names: (string | null)[]): boolean {
  return checkSponsorInJobs(jobs, names) === "confirmed";
}
