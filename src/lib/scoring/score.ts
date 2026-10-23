import { getOccupation, RULES_UPDATED_AT, type Occupation } from "./occupations";
import { annualise, parseSalary, plausibleAnnual, salaryFromDescription, type SalaryPeriod } from "./salary";
import { classifySeniority, type Seniority } from "./seniority";
import { sponsorshipSignal } from "./signals";
import { classifyOccupation } from "./soc";

/** Bump when the rules change, so every job is re-scored on the next run. */
export const SCORE_VERSION = 5;

export type Sponsorability = "sponsorship_mentioned" | "likely_eligible" | "check_with_employer" | "ineligible" | "unknown";
export type Reason = { code: string; message: string };

export type ScoreInput = {
  title: string;
  description: string | null;
  salaryText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  employmentType: string | null;
  sector: string | null;
  isNhsJobs: boolean;
  /** Linked to an active sponsor on the Skilled Worker route. */
  licensedSponsor: boolean;
  sponsorName: string | null;
};

export type ScoreResult = {
  socCode: string | null;
  seniority: Seniority;
  isGradScheme: boolean;
  sponsorability: Sponsorability;
  reasons: Reason[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  salaryAnnualMin: number | null;
  salaryAnnualMax: number | null;
};

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

/** Only employees can be sponsored, and not by a client hiring contractors through an agency. */
const SELF_EMPLOYED = /\b(self[- ]employed|freelance|freelancer|commission[- ]only|outside ir35)\b/i;
const CONTINGENT = /\b(contingent|day rate|umbrella)\b/i;
/** Short-term or as-needed work, usually not sponsored even by licensed employers. */
const AS_NEEDED = /\b(bank (nurse|staff|worker|practitioner|role|shifts?|midwife|doctor)|^bank\b|zero[- ]hours?|sessional|locum)\b/i;

/** Facts only: every reason states what was found, never what a visa outcome will be. */
export function scoreJob(input: ScoreInput): ScoreResult {
  const reasons: Reason[] = [];
  const text = `${input.title}\n${input.salaryText ?? ""}\n${input.description ?? ""}`;

  // Salary: structured fields from the ATS first, then the advertised text, then the description.
  // Structured values are only trusted when plausible (ATSes sometimes send £0 or mislabelled periods).
  const structured =
    input.salaryMin !== null && input.salaryPeriod && plausibleAnnual(annualise(input.salaryMin, input.salaryPeriod))
      ? {
          min: input.salaryMin,
          max: input.salaryMax !== null && plausibleAnnual(annualise(input.salaryMax, input.salaryPeriod)) ? input.salaryMax : input.salaryMin,
          period: input.salaryPeriod,
        }
      : null;
  const parsed = structured ?? parseSalary(input.salaryText) ?? salaryFromDescription(input.description);
  const annualMin = parsed ? annualise(parsed.min, parsed.period) : null;
  const annualMax = parsed ? annualise(parsed.max, parsed.period) : null;

  const { seniority, isGradScheme, isInternship, isApprenticeship } = classifySeniority(input.title, input.description, input.salaryText);
  const socCode = classifyOccupation(input.title, input.sector);
  const occupation: Occupation | null = getOccupation(socCode);
  const signal = sponsorshipSignal(text);

  const result = (sponsorability: Sponsorability): ScoreResult => ({
    socCode,
    seniority,
    isGradScheme,
    sponsorability,
    reasons,
    salaryMin: parsed?.min ?? null,
    salaryMax: parsed?.max ?? null,
    salaryPeriod: parsed?.period ?? null,
    salaryAnnualMin: annualMin,
    salaryAnnualMax: annualMax,
  });

  // Sponsor licence
  if (input.licensedSponsor) {
    reasons.push({ code: "licensed_sponsor", message: `${input.sponsorName ?? "The employer"} is on the register of licensed Skilled Worker sponsors.` });
  } else {
    reasons.push({ code: "sponsor_not_confirmed", message: "We couldn't match this employer to the register of licensed sponsors." });
  }

  // Hard stops
  if (signal.negative) {
    reasons.push({ code: "ad_says_no_sponsorship", message: `The ad says sponsorship isn't available: “${signal.negative}”` });
    return result("ineligible");
  }
  const contract = `${input.title} | ${input.employmentType ?? ""}`;
  // "Field Sales Consultant" ads often say "self-employed" only in the body.
  if (SELF_EMPLOYED.test(contract) || /\b(self[- ]employed|commission[- ]only)\b/i.test(input.description ?? "")) {
    reasons.push({ code: "self_employed", message: "This is a self-employed or freelance role; only employees can be sponsored." });
    return result("ineligible");
  }
  if (CONTINGENT.test(input.employmentType ?? "")) {
    reasons.push({ code: "contractor", message: "This is a contractor (day-rate) role; contractors aren't sponsored by the client company." });
    return result("ineligible");
  }
  const asNeeded = AS_NEEDED.test(input.title) || /^\s*bank\b/i.test(input.employmentType ?? "");
  if (isInternship) {
    reasons.push({ code: "internship", message: "Internships and placements are usually too short for Skilled Worker sponsorship." });
    return result("ineligible");
  }
  if (isApprenticeship) {
    reasons.push({ code: "apprenticeship", message: "Apprenticeships are training schemes and are rarely sponsored under the Skilled Worker route." });
    return result("ineligible");
  }
  if (occupation?.eligibility === "ineligible") {
    reasons.push({ code: "occupation_ineligible", message: `${occupation.title} (SOC ${occupation.soc}) isn't an eligible Skilled Worker occupation.` });
    return result("ineligible");
  }

  // Occupation and salary
  let salaryMeets: boolean | null = null;
  if (occupation?.eligibility === "national_pay_scale") {
    reasons.push({ code: "national_pay_scale", message: `${occupation.title} (SOC ${occupation.soc}) is paid on a national pay scale; NHS rates meet the Skilled Worker rules for this occupation.` });
    // NHS posts are paid on the scale. Elsewhere (pharma, private hospitals) compare with the scale figure.
    if (input.isNhsJobs || /\bband [5-9]\b|agenda for change/i.test(input.salaryText ?? "")) salaryMeets = true;
    else if (occupation.goingRate && annualMin !== null) salaryMeets = annualMin >= occupation.goingRate ? true : null;
  } else if (occupation?.eligibility === "eligible" && occupation.newEntrantRate) {
    if (annualMin === null) {
      reasons.push({ code: "salary_unknown", message: `No salary in the ad. New entrants in ${occupation.title} (SOC ${occupation.soc}) need at least ${gbp(occupation.newEntrantRate)} a year (rules as of ${RULES_UPDATED_AT.slice(0, 10)}).` });
    } else if (annualMin >= occupation.newEntrantRate) {
      salaryMeets = true;
      reasons.push({ code: "salary_meets_new_entrant", message: `Salary from ${gbp(annualMin)} a year is at or above the ${gbp(occupation.newEntrantRate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}).` });
    } else if (annualMax !== null && annualMax < occupation.newEntrantRate) {
      salaryMeets = false;
      reasons.push({ code: "salary_below_new_entrant", message: `Salary up to ${gbp(annualMax)} a year is below the ${gbp(occupation.newEntrantRate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}).` });
    } else {
      reasons.push({ code: "salary_range_spans_rate", message: `The salary range spans the ${gbp(occupation.newEntrantRate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}); the offer would need to be at or above it.` });
    }
  } else if (occupation?.eligibility === "limited") {
    reasons.push({ code: "occupation_limited", message: `${occupation.title} (SOC ${occupation.soc}) is only eligible in limited cases, such as occupations on the Temporary Shortage List.` });
  } else {
    reasons.push({ code: "occupation_unknown", message: "We couldn't match the job title to an occupation code, so the salary rule couldn't be checked." });
  }

  if (salaryMeets === false) return result("ineligible");

  if (signal.positive) {
    reasons.push({ code: "ad_mentions_sponsorship", message: `The ad mentions sponsorship: “${signal.positive}”` });
    return result("sponsorship_mentioned");
  }
  if (!input.licensedSponsor) return result("unknown");
  if (asNeeded) {
    reasons.push({ code: "as_needed_contract", message: "Bank, locum, sessional and zero-hours roles are usually short-term or self-employed; check with the employer whether they'd sponsor it." });
    return result("check_with_employer");
  }
  if (salaryMeets && occupation && occupation.eligibility !== "limited") {
    if (signal.rightToWorkOnly) {
      reasons.push({ code: "asks_right_to_work", message: "The ad asks for existing right to work in the UK, so check with the employer whether they'd sponsor this role." });
      return result("check_with_employer");
    }
    return result("likely_eligible");
  }
  return result("check_with_employer");
}
