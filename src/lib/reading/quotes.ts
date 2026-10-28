/**
 * The check that keeps the AI honest: every fact it reports carries a quote, and the
 * quote must really be in the ad. Comparison ignores what copying can change (case,
 * line breaks, bullets, typographic quotes and dashes), nothing else.
 */

/** Shorter quotes ("post", "no") would match almost any ad. */
const MIN_QUOTE_CHARS = 12;

export function normaliseForQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[•·▪●◦‣∙]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const trimEdges = (part: string) => part.replace(/^[\s.,;:!?"'()-]+|[\s.,;:!?"'()-]+$/g, "");

/** Whole short values: a line of their own ("Permanent") or one item of a field list ("Permanent, Part-time"). */
const wholeValues = (ad: string) => new Set(ad.split("\n").flatMap((line) => [line, ...line.split(",")]).map((v) => trimEdges(normaliseForQuote(v))));

/** True when the quote, or each part of it joined by an ellipsis, appears in the ad in order. */
export function quoteIsInAd(quote: string, ad: string): boolean {
  const haystack = normaliseForQuote(ad);
  const parts = normaliseForQuote(quote).split(/\s*(?:…|\.\.\.)\s*/).map(trimEdges);
  if (parts.length === 1 && parts[0].length > 0 && parts[0].length < MIN_QUOTE_CHARS) return wholeValues(ad).has(parts[0]);
  if (parts.length === 0 || parts.some((p) => p.length < MIN_QUOTE_CHARS)) return false;
  let from = 0;
  for (const part of parts) {
    const at = haystack.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }
  return true;
}
