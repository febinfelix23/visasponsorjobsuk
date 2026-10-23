import { coreName, droppedWords, fullName } from "@/lib/discovery/slugs";
import type { RawJob } from "./types";

const normaliseText = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/** Shorter single words ("map", "imc") are too ambiguous to identify a company. */
const MIN_SINGLE_WORD = 4;

type Phrase = { text: string; fromCore: boolean };

function phrasesFor(names: (string | null)[]): Phrase[] {
  const out = new Map<string, Phrase>();
  const add = (text: string, fromCore: boolean) => {
    if (!text || (!text.includes(" ") && text.length < MIN_SINGLE_WORD)) return;
    // A phrase reachable from the full name is the stronger kind.
    if (!out.has(text) || !fromCore) out.set(text, { text, fromCore });
  };
  for (const name of names) {
    if (!name) continue;
    const full = fullName(name);
    add(full, false);
    if (full.includes(" ")) add(full.replace(/ /g, ""), false);
    const core = coreName(name);
    if (core !== full) {
      add(core, true);
      if (core.includes(" ")) add(core.replace(/ /g, ""), true);
    }
  }
  return [...out.values()];
}

/**
 * Phrases that identify the sponsor in job text: its full name, its distinctive core
 * ("wise" for "Wise Payments Limited", since ads say "Wise"), and multi-word names
 * written as one word ("elevenlabs" for "Eleven Labs Ltd").
 */
export function sponsorPhrases(names: (string | null)[]): string[] {
  return phrasesFor(names).map((p) => p.text);
}

/** "needs_review": plausible but ambiguous (one-word core name, no specific confirming word). */
export type SponsorCheck = "confirmed" | "insufficient" | "needs_review" | "rejected";

/**
 * Does this board's UK job text show it belongs to the sponsor?
 * - A multi-word name in any job is enough.
 * - A one-word name could be anyone's: it must appear in most of at least two UK jobs
 *   (fewer jobs: "insufficient", check again later).
 * - If that one word is only the core of a longer name ("Alpha" of "Alpha Bank"), a
 *   descriptive word the core dropped ("bank") must also appear, so another "Alpha" is rejected.
 */
/**
 * Dropped words specific enough to confirm a one-word core match ("bank" for "Monzo Bank").
 * Generic ones ("services", "data", "technologies", "industries") appear in almost any
 * ad: "Axiom Manufacturing Services" matched Axiom the legal-services firm on "services".
 */
const CONFIRMING_STEMS: Record<string, string> = {
  bank: "bank", payments: "payment", financial: "financ", finance: "financ", insurance: "insur",
  investments: "invest", investment: "invest", trading: "trading", markets: "market", capital: "capital",
  energy: "energy", engineering: "engineer", manufacturing: "manufactur", games: "game", studio: "studio",
  studios: "studio", security: "secur", interactive: "game",
};
const CLINICAL_TITLE = /\b(nurs|clinic|medic|doctor|physician|surgeon|surgery|theatre|radiograph|physio|pharmac|dental|dentist|midwi|therap|patient|ward|consultant|gp|anaesth|paramedic|sonograph|optom|health ?care assistant|hca)\w*/i;

export function checkSponsorInJobs(jobs: RawJob[], names: (string | null)[], sponsorSector: string | null = null): SponsorCheck {
  const phrases = phrasesFor(names);
  if (phrases.length === 0 || jobs.length === 0) return "insufficient";
  const texts = jobs.map((job) => normaliseText(`${job.title}\n${job.description ?? ""}`));
  const has = (t: string, p: string) => t.includes(` ${p} `);

  if (texts.some((t) => phrases.some((p) => p.text.includes(" ") && has(t, p.text)))) return "confirmed";

  const single = phrases.filter((p) => !p.text.includes(" "));
  const matchingJobs = texts.filter((t) => single.some((p) => has(t, p.text)));
  if (matchingJobs.length === 0) return "rejected";
  if (jobs.length < 2) return "insufficient";
  if (matchingJobs.length / jobs.length < 0.5) return "rejected";

  const viaFullName = matchingJobs.some((t) => single.some((p) => !p.fromCore && has(t, p.text)));
  if (viaFullName) return "confirmed";
  // Healthcare: "Spire" of "Spire Healthcare" is also Spire Global (satellites). Clinical job titles settle it.
  if (sponsorSector === "healthcare") {
    const clinical = jobs.filter((j) => CLINICAL_TITLE.test(j.title)).length;
    return clinical / jobs.length >= 0.3 ? "confirmed" : "rejected";
  }
  const stems = names.flatMap((n) => (n ? droppedWords(n) : [])).flatMap((w) => (CONFIRMING_STEMS[w] ? [CONFIRMING_STEMS[w]] : []));
  // "Calibre Global", "Wayve Technologies": nothing specific to check. Text can't tell
  // the right company from a namesake, so a person (or the AI check) has to look.
  if (stems.length === 0) return "needs_review";
  // A specific word ("bank" for "Alpha Bank") that never appears is evidence against.
  return texts.some((t) => stems.some((stem) => new RegExp(`\\b${stem}`).test(t))) ? "confirmed" : "rejected";
}

export function mentionsSponsor(jobs: RawJob[], names: (string | null)[]): boolean {
  return checkSponsorInJobs(jobs, names) === "confirmed";
}
