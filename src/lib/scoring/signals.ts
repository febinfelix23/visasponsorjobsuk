/**
 * Sponsorship wording in an ad. A negative statement always wins: "we can't offer
 * sponsorship for this role" next to generic benefits text is a clear "no".
 */

const NEGATIVE: RegExp[] = [
  // "unable to offer visa sponsorship", "will not be able to offer sponsorship", "cannot sponsor"
  /\b(unable|not able|cannot|can ?not|can't|won't|will not|do not|don't|does not|doesn't|are not able|aren't able|not in a position)\s+(be\s+able\s+)?(to\s+)?((offer|provide|support|consider|accept)\s+(visa\s+|work\s+permit\s+|skilled worker\s+)?(sponsorship|sponsor)|sponsor\b)/i,
  // "visa sponsorship for this role is unfortunately not available"
  /\bsponsorship\b[^.]{0,40}?\b(is|will|are|can)\s+(unfortunately\s+)?not\s+(be\s+)?(available|offered|provided|possible|an option)/i,
  /\bno\s+(visa\s+)?sponsorship\b/i,
  /\b(without|not require|will not require|doesn't require|does not require|don't require|do not require|no need for)\s+(current\s+or\s+future\s+)?(visa\s+)?sponsorship/i,
  /\b(we|the company|this role)\s+(is|are)\s+(not|unable to)\s+(able\s+to\s+)?sponsor/i,
  /\bnot\s+(able|eligible)\s+to\s+sponsor\b/i,
];

/**
 * A "no" that depends on the applicant or the role, not a "no" for this job:
 * "unable to provide sponsorship to applicants who do not meet the eligibility criteria",
 * "we are unable to offer sponsorship for all job roles",
 * "the Trust will not sponsor where the starting salary does not meet immigration rules".
 */
const CONDITIONAL = /\b((to|for)\s+(applicants|candidates|those|anyone|individuals)\s+who|who do not meet|eligibility criteria|for all (job\s+)?(roles|posts|positions|vacancies)|for every (role|post|position)|unless\b|(where|if|when)\s+(the\s+)?(starting\s+)?(salary|pay|role|post|position|applicant|candidate)\b)/i;

/**
 * Not about immigration: US export-control wording ("without sponsorship for an export license"),
 * and doctors' registration ("we can not sponsor GMC registration for this role").
 */
const NOT_VISA = /\b(export|gmc|registration)\b/i;

/**
 * "You must have the right to work in the UK" appears in most UK ads, including
 * sponsors' (a sponsored visa gives that right), so it's only a soft signal.
 */
const RIGHT_TO_WORK = /\bmust\s+(already\s+)?(have|hold)\s+(the\s+|a\s+)?(full\s+|existing\s+|current\s+|valid\s+)?right to work in the uk\b/i;

/**
 * NHS Jobs' "Certificate of Sponsorship" statement. Trusts tick it per post, so it's
 * real evidence, but it says sponsored applicants are welcome, not that this role
 * passes the rules: the occupation, band and contract checks still apply.
 */
const NHS_STATEMENT = /applications from job seekers who require current skilled worker sponsorship[^.]{0,80}are welcome/i;

const POSITIVE: RegExp[] = [
  /\b(visa\s+)?sponsorship\s+(is\s+|can be\s+|will be\s+|may be\s+|might be\s+|could be\s+)?(available|offered|provided|considered|possible)\b/i,
  /\b(we|the company|this role)\s+(can|will|are able to|is able to|do)\s+(offer\s+|provide\s+)?(visa\s+)?sponsor(ship)?\b/i,
  /\b(able|happy|willing)\s+to\s+sponsor\b/i,
  /\boffer(s|ing)?\s+(visa\s+|skilled worker\s+)?sponsorship\b/i,
  /\bskilled worker (visa )?sponsorship (is )?(available|offered)\b/i,
];

/** "Sponsorship may be considered for exceptional candidates" is a maybe, not an offer. */
const HEDGED = /\b(may|might|could|consider(ed)?|case[- ]by[- ]case|exceptional|in some cases|for some roles|in the future|future (roles|opportunities))\b/i;

export type SponsorshipSignal = {
  /** The ad offers sponsorship ("visa sponsorship is available"). */
  positive: string | null;
  /** The NHS Jobs Certificate of Sponsorship statement. */
  nhsStatement: string | null;
  /** The ad only says sponsorship might be possible. */
  hedged: string | null;
  /** The ad says this role can't be sponsored. */
  negative: string | null;
  /** The ad's "no" depends on the applicant or on which role ("not for all roles"). */
  conditional: string | null;
  rightToWorkOnly: boolean;
};

/** The sentence around a match, so the quote reads as the ad wrote it. */
function sentenceAt(text: string, index: number, length: number): string {
  const before = text.slice(Math.max(0, index - 200), index);
  const after = text.slice(index + length, index + length + 200);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"), before.lastIndexOf("! "), before.lastIndexOf("? "));
  const endMatch = /[.!?](\s|$)|\n/.exec(after);
  return (before.slice(start + 1) + text.slice(index, index + length) + (endMatch ? after.slice(0, endMatch.index + 1) : after)).replace(/\s+/g, " ").trim();
}

const quote = (sentence: string) => (sentence.length > 220 ? `${sentence.slice(0, 217).trimEnd()}…` : sentence);

/** Screening questions ("Will you now or in the future require sponsorship?") state nothing. */
const isQuestion = (sentence: string) => sentence.endsWith("?") || /^(whether|if)\b/i.test(sentence);

/** Every statement (not question) a pattern matches, as its sentence. */
function* statements(text: string, pattern: RegExp): Generator<string> {
  for (const m of text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))) {
    const sentence = sentenceAt(text, m.index!, m[0].length);
    if (!isQuestion(sentence)) yield sentence;
  }
}

export function sponsorshipSignal(text: string | null | undefined): SponsorshipSignal {
  const none: SponsorshipSignal = { positive: null, nhsStatement: null, hedged: null, negative: null, conditional: null, rightToWorkOnly: false };
  if (!text) return none;
  // Ads use typographic apostrophes ("can’t"); match them as plain ones.
  const t = text.replace(/[‘’]/g, "'");
  const signal = { ...none, rightToWorkOnly: RIGHT_TO_WORK.test(t) };

  for (const p of NEGATIVE) {
    for (const s of statements(t, p)) {
      if (NOT_VISA.test(s)) continue;
      if (CONDITIONAL.test(s)) signal.conditional ??= quote(s);
      else signal.negative ??= quote(s);
    }
    if (signal.negative) break;
  }
  for (const s of statements(t, NHS_STATEMENT)) {
    signal.nhsStatement = quote(s);
    break;
  }
  // A sentence that says no ("unable to offer sponsorship for all roles") is never an offer.
  const saysNo = (s: string) => NEGATIVE.some((p) => p.test(s));
  for (const p of POSITIVE) {
    for (const s of statements(t, p)) {
      if (saysNo(s)) continue;
      if (HEDGED.test(s)) signal.hedged ??= quote(s);
      else signal.positive ??= quote(s);
    }
    if (signal.positive) break;
  }
  return signal;
}
