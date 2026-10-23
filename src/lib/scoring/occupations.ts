import data from "./skilled-occupations.json";

export type Eligibility = "eligible" | "limited" | "national_pay_scale" | "ineligible";

export type Occupation = {
  soc: string;
  title: string;
  eligibility: Eligibility;
  /** Full going rate (general Skilled Worker applicants). */
  goingRate: number | null;
  /** The new-entrant rate UK graduates switching visa need: the higher of £33,400 and 70% of the going rate. */
  newEntrantRate: number | null;
};

type Raw = { title: string; eligibility: Eligibility; goingRate: number | null; newEntrantRate: number | null };
const OCCUPATIONS = data.occupations as Record<string, Raw>;

// Listed with the pay-scale occupations but restricted by a note in the rules
// (healthcare assistants): not a graduate route, so treat as limited.
const OVERRIDES: Record<string, Eligibility> = { "6131": "limited" };

/** Date of the gov.uk rules the table was built from, shown with every salary check. */
export const RULES_UPDATED_AT: string = data.sourceUpdatedAt;
export const RULES_SOURCE: string = data.source;

export function getOccupation(soc: string | null | undefined): Occupation | null {
  if (!soc) return null;
  const raw = OCCUPATIONS[soc];
  if (!raw) return null;
  return { soc, title: raw.title, eligibility: OVERRIDES[soc] ?? raw.eligibility, goingRate: raw.goingRate, newEntrantRate: raw.newEntrantRate };
}
