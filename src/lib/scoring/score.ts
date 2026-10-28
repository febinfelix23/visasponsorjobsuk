import { getOccupation, RULES_UPDATED_AT, type Occupation } from "./occupations";
import { annualise, parseSalary, plausibleAnnual, salaryFromDescription, type ParsedSalary, type SalaryPeriod } from "./salary";
import { classifySeniority, type Seniority } from "./seniority";
import { sponsorshipSignal } from "./signals";
import { fieldFromOccupation } from "./fields";
import { classifyOccupation } from "./soc";

/** Bump when the rules change, so every job is re-scored on the next run. */
export const SCORE_VERSION = 13;

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
  /** AI classification for this title, when one exists (scripts/classify-jobs.ts). */
  aiSocCode?: string | null;
  aiField?: string | null;
  isNhsJobs: boolean;
  /** Linked to an active sponsor on the Skilled Worker route. */
  licensedSponsor: boolean;
  sponsorName: string | null;
};

export type ScoreResult = {
  socCode: string | null;
  field: string | null;
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
const rulesDate = new Date(RULES_UPDATED_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** Only employees can be sponsored, and not by a client hiring contractors through an agency. */
const SELF_EMPLOYED = /\b(self[- ]employed|freelance|freelancer|commission[- ]only|outside ir35)\b/i;
/**
 * In the description, only wording about the role itself counts: "Contract Type: Self-Employed",
 * "on a self-employed basis", "Uncapped Commissions | Self-Employed |". A bank's ad mentioning
 * "self-employed customers" or "mortgages for the self-employed" says nothing about the job.
 */
const SELF_EMPLOYED_ROLE = new RegExp(
  [
    String.raw`\bself[- ]employed\s+(basis|role|position|opportunity|contract|consultant|clinician|practitioner|adviser|advisor|agent|associate|partner)\b`,
    String.raw`\b(as|on)\s+a\s+self[- ]employed\b`,
    String.raw`\b(contract( type)?|employment( type)?|engagement)\s*:?[^\n]{0,30}\bself[- ]employed\b`,
    String.raw`\b(role|position|job|opportunity)\s+is\s+(a\s+)?self[- ]employed\b`,
    String.raw`(^|[|•])[ \t]*self[- ]employed[ \t]*([|•(]|$)`,
    String.raw`\bcommission[- ]only\b`,
  ].join("|"),
  "im",
);
const CONTINGENT = /\b(contingent|day rate|umbrella)\b/i;
/** Casual work, usually not sponsored even by licensed employers. */
const CASUAL = /\b(bank (nurse|staff|worker|practitioner|role|shifts?|midwife|doctor)|^bank\b|zero[- ]hours?|sessional)\b/i;
/** Locum posts are fixed-term cover: sponsored sometimes, so they need a check unless the ad offers it. */
const LOCUM = /\blocum\b/i;
/** Only when part-time is the sole pattern: "Full time, Part time" ads can be worked full time. */
const PART_TIME = /\bpart[- ]?time\b/i;
const FULL_TIME = /\bfull[- ]?time\b/i;

/** NHS Agenda for Change band: graduate-level registered roles start at Band 5. */
const nhsBand = (salaryText: string | null) => {
  const m = /\bband\s+([1-9])\b/i.exec(salaryText ?? "");
  return m ? Number(m[1]) : null;
};

/** Facts only: every reason states what was found, never what a visa outcome will be. */
export function scoreJob(input: ScoreInput): ScoreResult {
  const reasons: Reason[] = [];
  const text = `${input.title}\n${input.salaryText ?? ""}\n${input.description ?? ""}`;

  // Salary: structured fields from the ATS first, then the advertised text, then the description.
  // Structured values are only trusted when plausible (ATSes sometimes send £0 or mislabelled periods).
  const structured: ParsedSalary | null =
    input.salaryMin !== null && input.salaryPeriod && plausibleAnnual(annualise(input.salaryMin, input.salaryPeriod))
      ? {
          min: input.salaryMin,
          max: input.salaryMax !== null && plausibleAnnual(annualise(input.salaryMax, input.salaryPeriod)) ? input.salaryMax : input.salaryMin,
          period: input.salaryPeriod,
        }
      : null;
  const parsed = structured ?? parseSalary(input.salaryText, { envelope: true }) ?? salaryFromDescription(input.description);
  // "Up to £45,000" says nothing about the starting pay.
  const annualMin = parsed && !parsed.ceilingOnly ? annualise(parsed.min, parsed.period) : null;
  const annualMax = parsed ? annualise(parsed.max, parsed.period) : null;

  const { seniority, isGradScheme, isInternship, isApprenticeship } = classifySeniority(input.title, input.description, input.salaryText);
  // The AI reads the whole job; the keyword rules are the fallback.
  const aiSoc = input.aiSocCode && getOccupation(input.aiSocCode) ? input.aiSocCode : null;
  const socCode = aiSoc ?? classifyOccupation(input.title, input.sector);
  const occupation: Occupation | null = getOccupation(socCode);
  const signal = sponsorshipSignal(text);

  const result = (sponsorability: Sponsorability): ScoreResult => ({
    socCode,
    field: input.aiField ?? fieldFromOccupation(socCode, input.title),
    seniority,
    isGradScheme,
    sponsorability,
    reasons,
    salaryMin: parsed && !parsed.ceilingOnly ? parsed.min : null,
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
  if (signal.conditional) {
    reasons.push({ code: "ad_sponsorship_conditional", message: `The ad says sponsorship depends on the role or the applicant: “${signal.conditional}”` });
  }
  const contract = `${input.title} | ${input.employmentType ?? ""}`;
  // "Field Sales Consultant" ads often say "self-employed" only in the body.
  if (SELF_EMPLOYED.test(contract) || SELF_EMPLOYED_ROLE.test(input.description ?? "")) {
    reasons.push({ code: "self_employed", message: "This is a self-employed or freelance role; only employees can be sponsored." });
    return result("ineligible");
  }
  if (CONTINGENT.test(input.employmentType ?? "")) {
    reasons.push({ code: "contractor", message: "This is a contractor (day-rate) role; contractors aren't sponsored by the client company." });
    return result("ineligible");
  }
  const casual = CASUAL.test(input.title) || /^\s*bank\b/i.test(input.employmentType ?? "");
  const locum = LOCUM.test(contract);
  const partTime = (PART_TIME.test(contract) && !FULL_TIME.test(contract)) || /\bactual\s+£/i.test(input.salaryText ?? "");
  const band = nhsBand(input.salaryText);
  if (isInternship) {
    reasons.push({ code: "internship", message: "Internships and placements are usually too short for Skilled Worker sponsorship." });
    return result("ineligible");
  }
  if (isApprenticeship) {
    reasons.push({ code: "apprenticeship", message: "Apprenticeships are training schemes and are rarely sponsored under the Skilled Worker route." });
    return result("ineligible");
  }
  // An AI-chosen code can misfile a role (a customer success manager as customer service),
  // so on its own it never rules a job out: it only asks the person to check.
  if (occupation?.eligibility === "ineligible" && aiSoc === socCode) {
    reasons.push({ code: "occupation_maybe_ineligible", message: `This looks like ${occupation.title} (SOC ${occupation.soc}), which isn't an eligible Skilled Worker occupation. Check the role with the employer.` });
    return result(input.licensedSponsor ? "check_with_employer" : "unknown");
  }
  if (occupation?.eligibility === "ineligible") {
    reasons.push({ code: "occupation_ineligible", message: `${occupation.title} (SOC ${occupation.soc}) isn't an eligible Skilled Worker occupation.` });
    return result("ineligible");
  }

  // Occupation and salary
  // Bands only mean Agenda for Change on NHS posts and in pay-scale occupations, not an employer's own grades.
  const lowBand = band !== null && band < 5 && (input.isNhsJobs || occupation?.eligibility === "national_pay_scale");
  let salaryMeets: boolean | null = null;
  if (occupation?.eligibility === "national_pay_scale") {
    reasons.push({ code: "national_pay_scale", message: `${occupation.title} (SOC ${occupation.soc}) is paid on a national pay scale; NHS rates meet the Skilled Worker rules for this occupation.` });
    if (lowBand) {
      reasons.push({ code: "nhs_band_below_5", message: `This post is Band ${band}. Registered, graduate-level NHS roles in this occupation start at Band 5, so check the role with the employer.` });
    } else if (input.isNhsJobs || band !== null || /\bagenda for change\b/i.test(input.salaryText ?? "")) {
      // NHS posts are paid on the scale. Elsewhere (pharma, private hospitals) compare with the scale figure.
      salaryMeets = true;
    } else if (occupation.goingRate && annualMin !== null) salaryMeets = annualMin >= occupation.goingRate ? true : null;
  } else if (occupation?.eligibility === "eligible" && occupation.newEntrantRate) {
    if (annualMin !== null && annualMin >= occupation.newEntrantRate) {
      salaryMeets = true;
      reasons.push({ code: "salary_meets_new_entrant", message: `Salary from ${gbp(annualMin)} a year is at or above the ${gbp(occupation.newEntrantRate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}).` });
    } else if (annualMax !== null && annualMax < occupation.newEntrantRate) {
      salaryMeets = false;
      reasons.push({ code: "salary_below_new_entrant", message: `Salary up to ${gbp(annualMax)} a year is below the ${gbp(occupation.newEntrantRate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}).` });
    } else if (annualMin === null && annualMax !== null) {
      reasons.push({ code: "salary_ceiling_only", message: `The ad gives pay of up to ${gbp(annualMax)} a year but no starting figure. New entrants in ${occupation.title} (SOC ${occupation.soc}) need at least ${gbp(occupation.newEntrantRate)}, so the offer would need to be at or above it.` });
    } else if (annualMin === null) {
      reasons.push({ code: "salary_unknown", message: `No salary in the ad. New entrants in ${occupation.title} (SOC ${occupation.soc}) need at least ${gbp(occupation.newEntrantRate)} a year (rules as of ${rulesDate}).` });
    } else {
      reasons.push({ code: "salary_range_spans_rate", message: `The salary range spans the ${gbp(occupation.newEntrantRate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}); the offer would need to be at or above it.` });
    }
  } else if (occupation?.eligibility === "limited") {
    reasons.push({ code: "occupation_limited", message: `${occupation.title} (SOC ${occupation.soc}) is only eligible in limited cases, such as occupations on the Temporary Shortage List.` });
  } else {
    reasons.push({ code: "occupation_unknown", message: "We couldn't match the job title to an occupation code, so the salary rule couldn't be checked." });
  }
  // The salary rule is met by the pay actually received, not a full-time equivalent.
  if (salaryMeets && partTime) {
    salaryMeets = null;
    reasons.push({ code: "part_time", message: "This is a part-time post. The Skilled Worker salary rule applies to the pay you'd actually receive, not the full-time equivalent, so check the actual salary with the employer." });
  }

  // What the ad says about sponsorship. Recorded before deciding, so the reasons always show it.
  if (signal.positive) reasons.push({ code: "ad_mentions_sponsorship", message: `The ad mentions sponsorship: “${signal.positive}”` });
  if (signal.nhsStatement) reasons.push({ code: "nhs_sponsorship_statement", message: `The employer ticked NHS Jobs' Certificate of Sponsorship option for this post: “${signal.nhsStatement}”` });
  if (signal.hedged && !signal.positive) reasons.push({ code: "ad_sponsorship_maybe", message: `The ad says sponsorship might be possible: “${signal.hedged}”` });
  const offered = signal.positive !== null || signal.nhsStatement !== null;

  // The rules come first: what the ad says can't outweigh a failed check.
  if (salaryMeets === false) return result("ineligible");
  if (casual) {
    reasons.push({ code: "as_needed_contract", message: "Bank, sessional and zero-hours roles are usually casual or self-employed; check with the employer whether they'd sponsor it." });
    return result(input.licensedSponsor || offered ? "check_with_employer" : "unknown");
  }
  if (occupation?.eligibility === "limited" || lowBand) return result(input.licensedSponsor || offered ? "check_with_employer" : "unknown");

  if (offered) return result("sponsorship_mentioned");
  if (!input.licensedSponsor) return result("unknown");
  if (locum) {
    reasons.push({ code: "as_needed_contract", message: "Locum posts are temporary cover; check with the employer whether they'd sponsor it." });
    return result("check_with_employer");
  }
  if (salaryMeets && occupation) {
    if (signal.rightToWorkOnly) {
      reasons.push({ code: "asks_right_to_work", message: "The ad asks for existing right to work in the UK, so check with the employer whether they'd sponsor this role." });
      return result("check_with_employer");
    }
    if (signal.conditional) return result("check_with_employer");
    return result("likely_eligible");
  }
  return result("check_with_employer");
}
