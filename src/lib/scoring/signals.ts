/**
 * Sponsorship wording in an ad. A negative statement always wins: "we can't offer
 * sponsorship for this role" next to generic benefits text is a clear "no".
 */

const NEGATIVE: RegExp[] = [
  /\b(unable|not able|cannot|can ?not|can't|won't|will not|do not|don't|does not|doesn't|are not able|aren't able)\s+(to\s+)?(offer|provide|support|consider|accept)\s+(visa\s+|work\s+permit\s+|skilled worker\s+)?(sponsorship|sponsor)/i,
  // "visa sponsorship for this role is unfortunately not available"
  /\bsponsorship\b[^.]{0,40}?\b(is|will|are|can)\s+(unfortunately\s+)?not\s+(be\s+)?(available|offered|provided|possible|an option)/i,
  /\bno\s+(visa\s+)?sponsorship\b/i,
  /\b(without|not require|will not require|doesn't require|does not require|don't require|do not require|no need for)\s+(current\s+or\s+future\s+)?(visa\s+)?sponsorship/i,
  /\b(we|the company|this role)\s+(is|are)\s+(not|unable to)\s+(able\s+to\s+)?sponsor/i,
  /\bnot\s+(able|eligible)\s+to\s+sponsor\b/i,
];

/**
 * "You must have the right to work in the UK" appears in most UK ads, including
 * sponsors' (a sponsored visa gives that right), so it's only a soft signal.
 */
const RIGHT_TO_WORK = /\bmust\s+(already\s+)?(have|hold)\s+(the\s+|a\s+)?(full\s+|existing\s+|current\s+|valid\s+)?right to work in the uk\b/i;

const POSITIVE: RegExp[] = [
  // NHS Jobs' standard Certificate of Sponsorship statement.
  /applications from job seekers who require current skilled worker sponsorship[^.]{0,80}are welcome/i,
  /\b(visa\s+)?sponsorship\s+(is\s+|can be\s+|will be\s+)?(available|offered|provided|considered|possible)\b/i,
  /\b(we|the company|this role)\s+(can|will|are able to|is able to|do)\s+(offer\s+|provide\s+)?(visa\s+)?sponsor(ship)?\b/i,
  /\b(able|happy|willing)\s+to\s+sponsor\b/i,
  /\boffer(s|ing)?\s+(visa\s+|skilled worker\s+)?sponsorship\b/i,
  /\bskilled worker (visa )?sponsorship (is )?(available|offered)\b/i,
];

export type SponsorshipSignal = { positive: string | null; negative: string | null; rightToWorkOnly: boolean };

/** The sentence around a match, so the quote reads as the ad wrote it. */
function excerpt(text: string, index: number, length: number): string {
  const before = text.slice(Math.max(0, index - 200), index);
  const after = text.slice(index + length, index + length + 200);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"), before.lastIndexOf("! "), before.lastIndexOf("? "));
  const endMatch = /[.!?](\s|$)|\n/.exec(after);
  const sentence = before.slice(start + 1) + text.slice(index, index + length) + (endMatch ? after.slice(0, endMatch.index + 1) : after);
  const clean = sentence.replace(/\s+/g, " ").trim();
  return clean.length > 220 ? `${clean.slice(0, 217).trimEnd()}…` : clean;
}

export function sponsorshipSignal(text: string | null | undefined): SponsorshipSignal {
  if (!text) return { positive: null, negative: null, rightToWorkOnly: false };
  let negative: string | null = null;
  for (const p of NEGATIVE) {
    const m = p.exec(text);
    if (m) {
      negative = excerpt(text, m.index, m[0].length);
      break;
    }
  }
  let positive: string | null = null;
  for (const p of POSITIVE) {
    const m = p.exec(text);
    if (m) {
      positive = excerpt(text, m.index, m[0].length);
      break;
    }
  }
  return { positive, negative, rightToWorkOnly: RIGHT_TO_WORK.test(text) };
}
