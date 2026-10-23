import { normaliseOrgName } from "./normalise";
import { isNhsBody } from "./sectors";

// Words that vary freely between NHS Jobs and the register for the same body:
// "…NHS Trust" vs "…NHS Foundation Trust", "Health Board" vs "Local Health Board".
const NHS_STRUCTURAL = new Set(["nhs", "foundation", "foundationtrust", "trust", "ft", "local", "the", "and", "of"]);
const MIN_SIMILARITY = 0.75;

/** Distinctive words of an NHS body's name: "University Hospitals Sussex NHS FT (279)" → sussex, university, hospital. */
export function nhsTokens(name: string): Set<string> {
  const cleaned = name.replace(/\([^)]*\)/g, " ");
  return new Set(
    normaliseOrgName(cleaned)
      .split(" ")
      .map((t) => (t === "hospitals" ? "hospital" : t))
      .filter((t) => t && !NHS_STRUCTURAL.has(t)),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared || 1);
}

const looksNhs = (name: string) => isNhsBody(name) || /\b(trust|hospital|health board)\b/i.test(name);

export type SponsorName = { id: number; name: string };

/**
 * Resolves an employer advertised on NHS Jobs to a sponsor: exact normalised name
 * first, then (for NHS bodies only) the closest NHS sponsor by distinctive words,
 * accepted only when it's clearly the best candidate.
 */
export function createNhsMatcher(sponsors: SponsorName[]): (employer: string) => number | null {
  const exact = new Map<string, number>();
  for (const s of sponsors) {
    const key = normaliseOrgName(s.name);
    if (!exact.has(key)) exact.set(key, s.id);
  }
  const nhs = sponsors.filter((s) => looksNhs(s.name)).map((s) => ({ id: s.id, tokens: nhsTokens(s.name) }));

  return (employer) => {
    const hit = exact.get(normaliseOrgName(employer));
    if (hit !== undefined) return hit;
    if (!looksNhs(employer)) return null;
    const tokens = nhsTokens(employer);
    if (tokens.size === 0) return null;
    let best: { id: number; score: number } | null = null;
    let runnerUp = 0;
    for (const s of nhs) {
      const score = similarity(tokens, s.tokens);
      if (!best || score > best.score) {
        runnerUp = best?.score ?? 0;
        best = { id: s.id, score };
      } else if (score > runnerUp) {
        runnerUp = score;
      }
    }
    return best && best.score >= MIN_SIMILARITY && best.score > runnerUp ? best.id : null;
  };
}
