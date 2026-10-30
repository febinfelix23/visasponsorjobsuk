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
  /** The rate for everyone else: the higher of £41,700 and the going rate. */
  generalRate: number | null;
};

/** The general salary threshold (Immigration Rules, from 22 July 2025): no Skilled Worker salary below this, unless new entrant or other tradeable points. */
export const GENERAL_THRESHOLD = 41_700;

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
  return {
    soc,
    title: raw.title,
    eligibility: OVERRIDES[soc] ?? raw.eligibility,
    goingRate: raw.goingRate,
    newEntrantRate: raw.newEntrantRate,
    generalRate: raw.goingRate === null ? null : Math.max(GENERAL_THRESHOLD, raw.goingRate),
  };
}
