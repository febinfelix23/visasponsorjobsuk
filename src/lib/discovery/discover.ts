import { HostBlockedError } from "./http";
import { countUkJobs, NAMED_ATS, PROBES, type BoardHit, type ProbeAts } from "./probes";
import { droppedWords, fullName, isDistinctiveSlug, nameEvidence, slugCandidates, type SlugCandidate } from "./slugs";

/** Board names shorter than this (letters, ignoring spaces) need the scraper's job-text check. */
const MIN_TRUSTED_NAME = 4;

/** Most common in UK tech/finance first, so early exits save the most requests. */
export const PROBE_ORDER: ProbeAts[] = ["greenhouse", "lever", "ashby", "smartrecruiters"];

export type DiscoverySponsor = { id: number; name: string; tradingName: string | null };

export type VerdictReason =
  | "exact_name_uk_jobs" // board name is the sponsor's full name, and it has UK jobs
  | "core_name_confirmed_uk_jobs" // "Monzo" for "Monzo Bank", board description mentions "bank", UK jobs
  | "distinctive_slug_uk_jobs" // Lever: slug is the sponsor's distinctive full name, UK jobs
  | "needs_job_check" // plausible, but left for the scraper to confirm from job text
  | "no_uk_jobs"; // right name, but nothing in the UK right now (e.g. a foreign sister company)

export type Verdict = {
  hit: BoardHit;
  slug: SlugCandidate;
  status: "active" | "unverified";
  reason: VerdictReason;
  ukJobs: number | null;
};

export type ProbeFn = (ats: ProbeAts, slug: string) => Promise<BoardHit | null>;
export type UkJobsFn = (hit: BoardHit) => Promise<number | null>;

/**
 * Decides whether a board belongs to this sponsor. Returns null for a board that
 * clearly belongs to someone else. A board only goes "active" with both a strong
 * name match and current UK jobs: "Spire" on Greenhouse is Spire Global, not Spire
 * Healthcare, and "forvismazars" is the German firm.
 */
export async function judgeHit(
  hit: BoardHit,
  slug: SlugCandidate,
  sponsor: DiscoverySponsor,
  ukJobs: UkJobsFn,
): Promise<Verdict | null> {
  const names = [sponsor.name, sponsor.tradingName];
  let strongName: boolean;

  if (NAMED_ATS.has(hit.ats) && hit.boardName) {
    const evidence = nameEvidence(hit.boardName, names);
    if (evidence === "none") return null;
    if (fullName(hit.boardName).replace(/ /g, "").length < MIN_TRUSTED_NAME) {
      // "MAP", "IMC": too short to identify a company on name alone.
      strongName = false;
    } else if (evidence === "exact") {
      strongName = true;
    } else {
      // Only the distinctive part matched. Fine if the dropped words were structural
      // ("Europe", "Group"); a descriptive one ("bank") must appear in the board's own description.
      const text = `${hit.boardName} ${hit.description ?? ""}`.toLowerCase();
      const dropped = names.flatMap((n) => (n ? droppedWords(n) : []));
      strongName = dropped.length === 0 || dropped.some((w) => new RegExp(`\\b${w}\\b`).test(text));
    }
  } else {
    strongName = hit.ats === "lever" && isDistinctiveSlug(slug);
  }

  if (!strongName) return { hit, slug, status: "unverified", reason: "needs_job_check", ukJobs: null };

  const uk = await ukJobs(hit);
  if (uk === null) return { hit, slug, status: "unverified", reason: "needs_job_check", ukJobs: null };
  if (uk === 0) return { hit, slug, status: "unverified", reason: "no_uk_jobs", ukJobs: 0 };
  const reason: VerdictReason =
    hit.ats === "lever"
      ? "distinctive_slug_uk_jobs"
      : nameEvidence(hit.boardName ?? "", names) === "exact"
        ? "exact_name_uk_jobs"
        : "core_name_confirmed_uk_jobs";
  return { hit, slug, status: "active", reason, ukJobs: uk };
}

/** Shares probe results across sponsors in one run (one company often has several register rows). */
export function memoisedProbe(probes = PROBES): ProbeFn {
  const memo = new Map<string, Promise<BoardHit | null>>();
  return (ats, slug) => {
    const key = `${ats}:${slug}`;
    let result = memo.get(key);
    if (!result) {
      result = probes[ats](slug);
      memo.set(key, result);
    }
    return result;
  };
}

export type DiscoveryOutcome = {
  verdicts: Verdict[];
  errors: string[];
  /** A host blocked us mid-sponsor: the sponsor wasn't fully probed and must be retried. */
  blocked: boolean;
  requests: number;
};

/**
 * Tries the sponsor's slug candidates against every ATS, most specific slug first,
 * and stops at the first slug that yields a confirmed board.
 */
export async function discoverSponsor(
  sponsor: DiscoverySponsor,
  probe: ProbeFn,
  ukJobs: UkJobsFn = countUkJobs,
): Promise<DiscoveryOutcome> {
  const verdicts = new Map<string, Verdict>();
  const errors: string[] = [];
  let blocked = false;
  let requests = 0;

  for (const slug of slugCandidates(sponsor.name, sponsor.tradingName)) {
    const results = await Promise.allSettled(PROBE_ORDER.map((ats) => probe(ats, slug.slug)));
    requests += PROBE_ORDER.length;
    for (const result of results) {
      if (result.status === "rejected") {
        if (result.reason instanceof HostBlockedError) blocked = true;
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        continue;
      }
      if (!result.value) continue;
      const key = `${result.value.ats}:${result.value.identifier}`;
      if (verdicts.get(key)?.status === "active") continue;
      try {
        const verdict = await judgeHit(result.value, slug, sponsor, ukJobs);
        if (verdict) {
          requests++;
          verdicts.set(key, verdict);
        }
      } catch (error) {
        if (error instanceof HostBlockedError) blocked = true;
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if ([...verdicts.values()].some((v) => v.status === "active")) break;
  }
  return { verdicts: [...verdicts.values()], errors, blocked, requests };
}
