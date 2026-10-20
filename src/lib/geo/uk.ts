// Country names, nations and the larger UK cities and towns that show up in job locations.
const UK_PLACES = [
  "united kingdom", "uk", "u\\.k\\.", "great britain", "gb", "england", "scotland", "wales", "northern ireland",
  "london", "manchester", "birmingham", "leeds", "liverpool", "bristol", "sheffield", "newcastle", "nottingham",
  "leicester", "coventry", "edinburgh", "glasgow", "aberdeen", "dundee", "cardiff", "swansea", "belfast",
  "cambridge", "oxford", "reading", "milton keynes", "southampton", "portsmouth", "brighton", "york", "bath",
  "exeter", "plymouth", "norwich", "guildford", "basingstoke", "slough", "watford", "stevenage", "derby",
  "bradford", "hull", "sunderland", "middlesbrough", "preston", "warrington", "chester", "crewe", "stoke",
  "wolverhampton", "telford", "gloucester", "cheltenham", "swindon", "bournemouth", "poole", "luton",
  "ipswich", "colchester", "chelmsford", "maidstone", "canterbury", "crawley", "harlow", "farnborough",
];

const UK_PATTERN = new RegExp(`(^|[^a-z])(${UK_PLACES.join("|")})([^a-z]|$)`, "i");
// "London, Ontario" and "Cambridge, MA" are the usual false friends.
const NOT_UK = /\b(ontario|canada|massachusetts|\bma\b|kentucky|ohio|usa|united states)\b/i;

/** True when a free-text job location is in the UK. */
export function isUkLocation(location: string | null | undefined): boolean {
  if (!location) return false;
  return UK_PATTERN.test(location) && !(NOT_UK.test(location) && !/united kingdom|\buk\b|england|scotland|wales/i.test(location));
}

/** ISO 3166 country codes the ATSes use for the UK. */
export function isUkCountryCode(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && ["gb", "uk", "gbr"].includes(code.toLowerCase());
}
