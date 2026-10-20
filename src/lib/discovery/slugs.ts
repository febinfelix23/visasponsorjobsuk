import { normaliseOrgName } from "@/lib/sponsors/normalise";

/** Words that rarely appear in an ATS slug or board name ("Monzo Bank Ltd" posts as "monzo"). */
const GENERIC_TOKENS = new Set([
  "uk", "gb", "group", "holdings", "holding", "international", "global", "europe", "emea",
  "services", "service", "solutions", "technologies", "technology", "tech", "software", "labs",
  "systems", "consulting", "consultancy", "digital", "company", "co", "and", "of", "partners",
  "london", "bank", "capital", "ventures", "enterprises", "worldwide", "corporation", "corp",
  // Sector descriptors: "Wise Payments Limited" posts as "wise".
  "payments", "financial", "finance", "insurance", "investments", "investment", "markets", "trading",
  "energy", "health", "healthcare", "medical", "engineering", "media", "studio", "studios", "ai",
  "analytics", "data", "cloud", "networks", "network", "security", "consultants", "management",
  "research", "industries", "manufacturing", "platforms", "platform", "online", "interactive", "games",
]);
const DROPPED_FROM_FULL = new Set(["uk", "gb"]);

const MIN_SLUG = 3;
const MAX_SLUG = 40;
const MAX_CANDIDATES = 6;

export type SlugKind = "full" | "core";
/** `words`: how many words of the name the slug was built from. */
export type SlugCandidate = { slug: string; kind: SlugKind; words: number };

const tokensOf = (name: string) => normaliseOrgName(name).split(" ").filter(Boolean);

/** The distinctive part of a name, used to compare a board's name with a sponsor's. */
export function coreName(name: string): string {
  return tokensOf(name)
    .filter((t) => !DROPPED_FROM_FULL.has(t) && !GENERIC_TOKENS.has(t))
    .join(" ");
}

/** The whole name minus legal suffixes and "UK". */
export function fullName(name: string): string {
  return tokensOf(name)
    .filter((t) => !DROPPED_FROM_FULL.has(t))
    .join(" ");
}

/** Words about a company's structure or geography, not what it does. */
const STRUCTURAL_TOKENS = new Set([
  "group", "holdings", "holding", "international", "global", "europe", "emea", "worldwide",
  "company", "co", "corporation", "corp", "london", "enterprises", "partners", "and", "of",
]);

/**
 * Descriptive words coreName() removed, e.g. ["bank"] for "Monzo Bank Ltd", but
 * nothing for "Jane Street Europe Limited": "Europe" says where, not what.
 */
export function droppedWords(name: string): string[] {
  return tokensOf(name).filter((t) => GENERIC_TOKENS.has(t) && !DROPPED_FROM_FULL.has(t) && !STRUCTURAL_TOKENS.has(t));
}

export type NameEvidence = "exact" | "core" | "none";

/**
 * How well a board's name matches a sponsor: the whole name ("exact"), only after
 * dropping generic words ("core": "Monzo" for "Monzo Bank", but also "Spire" for
 * "Spire Healthcare"), or not at all.
 */
export function nameEvidence(boardName: string, sponsorNames: (string | null)[]): NameEvidence {
  const names = sponsorNames.filter((n): n is string => n !== null);
  const boardFull = fullName(boardName);
  if (boardFull !== "" && names.some((n) => fullName(n) === boardFull)) return "exact";
  const boardCore = coreName(boardName);
  if (boardCore !== "" && names.some((n) => coreName(n) === boardCore)) return "core";
  return "none";
}

export function namesMatch(boardName: string, sponsorNames: (string | null)[]): boolean {
  return nameEvidence(boardName, sponsorNames) !== "none";
}

/**
 * Guesses at a sponsor's ATS slug, most specific first: the full name, then its
 * distinctive core. "Monzo Bank Ltd" → monzobank, monzo-bank, monzo.
 */
export function slugCandidates(name: string, tradingName: string | null): SlugCandidate[] {
  const out: SlugCandidate[] = [];
  const seen = new Set<string>();
  const add = (tokens: string[], kind: SlugKind) => {
    if (tokens.length === 0) return;
    for (const slug of [tokens.join(""), tokens.join("-")]) {
      if (slug.length < MIN_SLUG || slug.length > MAX_SLUG || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, kind, words: tokens.length });
    }
  };

  for (const source of [tradingName, name]) {
    if (!source) continue;
    const full = tokensOf(source).filter((t) => !DROPPED_FROM_FULL.has(t));
    add(full, "full");
  }
  for (const source of [tradingName, name]) {
    if (!source) continue;
    add(coreName(source).split(" ").filter(Boolean), "core");
  }
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * A full-name slug is trusted without a board name only when it's distinctive:
 * two or more words, or one long word. "bloom" could be anyone; "monzobank" is Monzo.
 */
export function isDistinctiveSlug(candidate: SlugCandidate): boolean {
  return candidate.kind === "full" && (candidate.words >= 2 || candidate.slug.length >= 8);
}
