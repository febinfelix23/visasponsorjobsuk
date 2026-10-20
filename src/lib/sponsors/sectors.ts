export type Sector = "tech" | "finance" | "engineering" | "healthcare" | "other";
export type SectorSource = "nhs_name" | "known_employer" | "sic" | "name_keyword" | "manual";

export const IN_SCOPE_SECTORS: ReadonlySet<Sector> = new Set(["tech", "finance", "engineering", "healthcare"]);

/**
 * SIC 2007 prefixes → sector. The longest matching prefix wins, so a specific
 * code (e.g. 7111 architecture) can override its broader group (711 → engineering).
 * `null` marks a neutral code that says nothing about the business.
 */
const SIC_PREFIX_SECTOR: Record<string, Sector | null> = {
  // Tech
  "5821": "tech", // games publishing
  "5829": "tech", // software publishing
  "61": "tech", // telecoms
  "62": "tech", // programming, IT consultancy
  "631": "tech", // data processing, hosting, web portals
  // Finance
  "64": "finance", // banking, funds
  "642": null, // holding companies: any kind of group
  "65": "finance", // insurance, pensions
  "66": "finance", // auxiliary financial services, fund management
  "6920": "finance", // accounting, audit, tax
  "70221": "finance", // financial management consultancy
  // Engineering
  "06": "engineering", // oil and gas extraction
  "091": "engineering", // oil and gas support
  "20": "engineering", // chemicals
  "24": "engineering", // basic metals
  "25": "engineering", // fabricated metal products
  "26": "engineering", // computers, electronics, optics
  "27": "engineering", // electrical equipment
  "28": "engineering", // machinery
  "29": "engineering", // motor vehicles
  "30": "engineering", // other transport incl. aerospace, rail, ships
  "33": "engineering", // repair and installation of machinery
  "35": "engineering", // electricity, gas, energy
  "36": "engineering", // water
  "42": "engineering", // civil engineering
  "711": "engineering", // engineering activities and technical consultancy
  "7111": "other", // architecture
  "7112": "engineering",
  "712": "engineering", // technical testing and analysis
  "7219": "engineering", // R&D in engineering and natural sciences
  // Healthcare and life sciences
  "21": "healthcare", // pharmaceuticals
  "325": "healthcare", // medical and dental instruments
  "7211": "healthcare", // biotechnology R&D
  "86": "healthcare", // hospitals, GPs, specialists, dental
};

/**
 * Care homes (87) and social work (88) dominate the register but sponsor
 * care-worker roles, which closed to new sponsorship in 2025 and aren't graduate jobs.
 * A company listing any of these codes is treated as care, whatever else it lists.
 */
const EXCLUDED_ANYWHERE = ["87", "88"];
/** Recruitment agencies post other firms' roles; excluded when it's their main activity. */
const EXCLUDED_AS_PRIMARY = ["78"];

export function sicToSector(code: string): Sector | null {
  for (let len = code.length; len >= 2; len--) {
    const prefix = code.slice(0, len);
    if (Object.hasOwn(SIC_PREFIX_SECTOR, prefix)) return SIC_PREFIX_SECTOR[prefix];
  }
  return null;
}

/** Codes that identify real clinical or life-sciences work, as opposed to generic 86900. */
// 86101 hospitals, 862 medical and dental practice. Not 86102, which is nursing homes.
const CLINICAL_SIC = /^(86101|862|21|325|7211)/;

/**
 * Care agencies often register as 86900 "other human health activities". A
 * healthcare match with only that kind of code and a care-sounding name is treated as care.
 */
export function isLikelyCareProvider(name: string, codes: string[]): boolean {
  return CARE_WORDS.test(name) && !codes.some((c) => CLINICAL_SIC.test(c));
}

/** "62020 - Information technology consultancy activities" → "62020". */
export function parseSicText(text: string): string | null {
  const match = /^\s*(\d{4,5})\b/.exec(text);
  return match ? match[1] : null;
}

/** Codes in Companies House order (primary first). */
export function sectorFromSicCodes(codes: string[]): Sector | null {
  if (codes.length === 0) return null;
  if (codes.some((c) => EXCLUDED_ANYWHERE.some((p) => c.startsWith(p)))) return "other";
  if (EXCLUDED_AS_PRIMARY.some((p) => codes[0].startsWith(p))) return "other";
  for (const code of codes) {
    const sector = sicToSector(code);
    if (sector && IN_SCOPE_SECTORS.has(sector)) return sector;
  }
  return "other";
}

// NHS England/Wales trusts, Scottish health boards ("NHS Lothian"), Welsh health boards,
// NI health and social care trusts, integrated care boards, NHS Blood and Transplant, etc.
const NHS_PATTERNS = [
  /\bnhs\b/i,
  /\bhealth board\b/i,
  /\bhealth and social care trust\b/i,
  /\bintegrated care board\b/i,
];

export function isNhsBody(name: string): boolean {
  return NHS_PATTERNS.some((p) => p.test(name));
}

/**
 * Last-resort guess for sponsors that didn't match Companies House (partnerships,
 * GP practices, charities). Deliberately avoids "care"/"healthcare", which mostly
 * mean care agencies on the register.
 */
const NAME_KEYWORDS: [Sector, RegExp][] = [
  [
    "healthcare",
    /\b(hospitals?|clinics?|medical (practice|centre|center|group)|health centre|surgery|dental|pharmacy|pharmaceuticals?|biotech|therapeutics|diagnostics)\b/i,
  ],
  ["tech", /\b(software|technolog(y|ies)|digital|cyber|analytics|computing|data science)\b/i],
  ["finance", /\b(bank|banking|financial|asset management|investments?|insurance|actuaries|accountants|securities)\b/i],
  ["engineering", /\b(engineering|engineers|aerospace|renewables|robotics|semiconductors?)\b/i],
];
const CARE_WORDS = /\b(care|homecare|healthcare|nursing home|homes|domiciliary|support|supported living|residential)\b/i;

export function sectorFromName(name: string): Sector | null {
  if (CARE_WORDS.test(name)) return null;
  for (const [sector, pattern] of NAME_KEYWORDS) if (pattern.test(name)) return sector;
  return null;
}

/**
 * Companies House accounts category → rough size band (0 = micro/unknown … 3 = large).
 * Graduate schemes come almost entirely from bands 2–3, so this drives crawl priority.
 */
export function sizeBandFromAccounts(category: string): number {
  switch (category.trim().toUpperCase()) {
    case "GROUP":
    case "FULL":
      return 3;
    case "MEDIUM":
    case "AUDIT EXEMPTION SUBSIDIARY":
    case "FILING EXEMPTION SUBSIDIARY":
      return 2;
    case "SMALL":
    case "TOTAL EXEMPTION FULL":
    case "TOTAL EXEMPTION SMALL":
    case "UNAUDITED ABRIDGED":
    case "AUDITED ABRIDGED":
    case "PARTIAL EXEMPTION":
      return 1;
    default:
      return 0;
  }
}

/**
 * Crawl order for in-scope sponsors (0 when out of scope). Size dominates; licence
 * rating and match confidence break ties.
 */
export function priorityScore(input: {
  inScope: boolean;
  sizeBand: number;
  workerRating: string | null;
  matchConfidence: number;
}): number {
  if (!input.inScope) return 0;
  const ratingBonus = input.workerRating?.startsWith("A") ? 1 : 0;
  return input.sizeBand * 2 + ratingBonus + input.matchConfidence * 2;
}
