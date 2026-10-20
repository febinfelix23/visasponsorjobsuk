const TRADING_AS = /\s+(?:t\/a|t\/as|trading\s+as)\s+/i;

// Legal-form and filler words dropped from the end of names, so that
// "Monzo Bank Ltd" and "MONZO BANK LIMITED" both become "monzo bank".
// "uk" is kept: dropping it merges e.g. "AstraZeneca UK Limited" with other AstraZeneca companies.
const TRAILING_NOISE = new Set(["ltd", "limited", "plc", "llp", "lp", "inc", "llc", "the"]);

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Splits "Legal Name Ltd t/a Brand" into its legal and trading names. */
export function splitTradingName(name: string): { legalName: string; tradingName: string | null } {
  const [legal, ...rest] = collapseWhitespace(name).split(TRADING_AS);
  const trading = rest.join(" ").trim();
  return { legalName: legal.trim(), tradingName: trading || null };
}

/** Lowercase, ASCII-only, punctuation-free name used for matching against other datasets. */
export function normaliseOrgName(name: string): string {
  const tokens = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (tokens[0] === "the" && tokens.length > 1) tokens.shift();
  while (tokens.length > 1 && TRAILING_NOISE.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

export function registerKey(name: string, town: string): string {
  return `${collapseWhitespace(name).toLowerCase()}|${collapseWhitespace(town).toLowerCase()}`;
}
