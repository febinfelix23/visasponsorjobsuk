/**
 * Fields of work: what a job is, independent of who the employer is. One registry
 * drives the site's filters, the AI classifier's instructions and the rules fallback,
 * so adding a field is one entry here plus a re-classification.
 */
export const FIELDS = [
  { key: "software", label: "Software & IT", describe: "Software development, DevOps, cloud, infrastructure, cyber security, IT support, QA and testing, IT and technical product or project management" },
  { key: "data", label: "Data & AI", describe: "Data science, data and analytics engineering, data analysis, business intelligence, machine learning and AI research, statistics" },
  { key: "engineering", label: "Engineering", describe: "Civil, structural, mechanical, electrical, electronics, aerospace, chemical, process, manufacturing and systems engineering; surveying and construction; engineering technicians" },
  { key: "science", label: "Science & research", describe: "Laboratory science, biology, chemistry, physics, life-sciences research and R&D outside clinical care" },
  { key: "healthcare", label: "Healthcare", describe: "Doctors, nurses, midwives, allied health professionals, pharmacists, dentists, clinical scientists and other patient-facing clinical roles" },
  { key: "finance", label: "Finance & accounting", describe: "Accountancy, audit, tax, financial and investment analysis, treasury, risk and actuarial work, financial control and FP&A" },
  { key: "business", label: "Business & consulting", describe: "Strategy and management consulting, operations, business analysis, non-IT project and programme management, procurement, policy" },
  { key: "sales_marketing", label: "Sales & marketing", describe: "Sales, business development, account management, customer success, marketing, communications, PR" },
  { key: "legal", label: "Legal", describe: "Solicitors, lawyers, in-house counsel, paralegals, compliance-legal roles" },
  { key: "people", label: "People & HR", describe: "Human resources, recruitment, talent acquisition, learning and development" },
  { key: "design", label: "Design", describe: "UX and UI design, product design, user research, graphic, motion and multimedia design" },
  { key: "other", label: "Other", describe: "Anything that fits none of the above (for example customer service, administration, hospitality, security guarding)" },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
export const FIELD_KEYS = FIELDS.map((f) => f.key) as FieldKey[];
export const FIELD_LABEL: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));
export const isFieldKey = (v: unknown): v is FieldKey => typeof v === "string" && (FIELD_KEYS as string[]).includes(v);

/** Rules fallback: the field implied by an occupation code when no AI classification exists. */
const FIELD_BY_SOC: Record<string, FieldKey> = {
  "2131": "software", "2132": "software", "2133": "software", "2134": "software", "2135": "software",
  "2136": "software", "2137": "software", "2139": "software", "3131": "software", "3132": "software",
  "3544": "data",
  "2141": "design", "2142": "design",
  "2121": "engineering", "2122": "engineering", "2123": "engineering", "2124": "engineering", "2125": "engineering",
  "2126": "engineering", "2127": "engineering", "2129": "engineering", "2152": "engineering", "3112": "engineering",
  "3113": "engineering", "2451": "engineering", "2452": "engineering", "2453": "engineering", "2454": "engineering",
  "2455": "engineering",
  "2112": "science", "2113": "science", "2114": "science", "2115": "science", "2119": "science", "2161": "science",
  "2162": "science", "3111": "science",
  "2211": "healthcare", "2212": "healthcare", "2221": "healthcare", "2222": "healthcare", "2223": "healthcare",
  "2224": "healthcare", "2225": "healthcare", "2229": "healthcare", "2231": "healthcare", "2232": "healthcare",
  "2233": "healthcare", "2234": "healthcare", "2235": "healthcare", "2236": "healthcare", "2237": "healthcare",
  "2251": "healthcare", "2252": "healthcare", "2253": "healthcare", "2254": "healthcare", "2255": "healthcare",
  "2256": "healthcare", "2259": "healthcare", "3212": "healthcare", "3213": "healthcare", "3219": "healthcare",
  "6131": "healthcare",
  "2421": "finance", "2422": "finance", "2423": "finance", "1131": "finance", "3534": "finance", "4122": "finance",
  "2431": "business", "2440": "business", "1139": "business", "3549": "business",
  "3552": "sales_marketing", "3556": "sales_marketing", "2432": "sales_marketing", "3554": "sales_marketing", "1132": "sales_marketing",
  "2411": "legal", "2412": "legal", "2419": "legal", "3520": "legal",
  "1136": "people", "3571": "people",
  "9231": "other",
};

/** 2433 covers actuaries and economists (finance) and statisticians and data scientists (data). */
const FINANCE_2433 = /\b(actuar(y|ial)|economist|quantitative|quant)\b/i;

export function fieldFromOccupation(socCode: string | null, title: string): FieldKey | null {
  if (socCode === "2433") return FINANCE_2433.test(title) ? "finance" : "data";
  return (socCode && FIELD_BY_SOC[socCode]) || null;
}

/** Codes the rules fallback knows; a test checks each is in the official table. */
export const FIELD_RULE_CODES = Object.keys(FIELD_BY_SOC);
