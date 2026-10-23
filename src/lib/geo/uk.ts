import registerTowns from "./uk-towns.json";

// Generated from the sponsor register by scripts/build-uk-towns.ts.
const UK_TOWNS = new Set<string>(registerTowns as string[]);

// Common in job locations but missing or rare on the register.
const EXTRA_UK_PLACES = ["greater london", "city of london", "canary wharf", "central london", "east london", "west midlands", "greater manchester", "home counties", "south east", "north west", "north east", "south west", "east midlands", "thames valley"];
for (const p of EXTRA_UK_PLACES) UK_TOWNS.add(p);

/** UK town names that are also well-known places abroad; on their own they prove nothing. */
const AMBIGUOUS_TOWNS = new Set(["washington", "boston", "perth", "richmond", "victoria", "hamilton", "dover", "newport", "kingston", "windsor", "durham", "portland", "salem", "plymouth"]);

const UK_COUNTRY = /\b(united kingdom|uk|u\.k\.|great britain|britain|gb|gbr|england|scotland|wales|northern ireland)\b/i;
// Phrases that contain a UK word but aren't in the UK.
const UK_FALSE_FRIENDS = /\b(new england|new south wales|ukraine)\b/i;

const FOREIGN = new RegExp(
  "\\b(" +
    [
      "united states", "usa", "u\\.s\\.a?", "canada", "ontario", "quebec", "british columbia", "australia", "new zealand",
      "ireland", "india", "germany", "deutschland", "france", "spain", "españa", "netherlands", "belgium", "poland",
      "portugal", "italy", "switzerland", "sweden", "denmark", "norway", "finland", "austria", "czech", "romania",
      "hungary", "greece", "turkey", "israel", "singapore", "hong kong", "japan", "china", "korea", "taiwan",
      "philippines", "malaysia", "indonesia", "vietnam", "thailand", "uae", "united arab emirates", "dubai", "saudi",
      "qatar", "egypt", "nigeria", "kenya", "south africa", "brazil", "mexico", "argentina", "colombia", "chile",
      "new york", "california", "texas", "massachusetts", "illinois", "washington dc", "district of columbia",
    ].join("|") +
    ")\\b",
  "i",
);
// "Boston, MA", "Washington, DC": a two-letter US state or Canadian province code after a comma.
const US_STATE_CODE = /,\s*(A[LKZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]|ON|BC|QC|AB)\b/;
// Workday-style prefixes: "US - Gaithersburg - MD", "IN-Bangalore".
const FOREIGN_PREFIX = /^\s*(us|usa|in|de|fr|es|ie|nl|ca|au|sg|cn|jp|pl|pt|it|ch|se|dk)\s*[-–—:]/i;
const UK_PREFIX = /^\s*(gb|uk)\s*[-–—:]/i;

/** True when a free-text job location is in the UK. "Remote" with no country is not. */
export function isUkLocation(location: string | null | undefined): boolean {
  if (!location) return false;
  const text = location.replace(/\s+/g, " ").trim();
  if (!text) return false;

  const withoutFalseFriends = text.replace(new RegExp(UK_FALSE_FRIENDS.source, "gi"), " ");
  if (UK_PREFIX.test(text) || UK_COUNTRY.test(withoutFalseFriends)) return true;
  if (FOREIGN_PREFIX.test(text) || FOREIGN.test(text) || US_STATE_CODE.test(text)) return false;

  const segments = text
    .toLowerCase()
    .split(/[,;|/()\-–—]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.some((segment) => {
    // "Leeds Wellington Place": the town is often followed by an office name.
    const words = segment.split(" ");
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      const place = words.slice(0, n).join(" ");
      if (UK_TOWNS.has(place)) return !AMBIGUOUS_TOWNS.has(place);
    }
    return false;
  });
}

/** ISO 3166 country codes the ATSes use for the UK. */
export function isUkCountryCode(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && ["gb", "uk", "gbr"].includes(code.toLowerCase());
}
