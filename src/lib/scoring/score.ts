import type { ContractType, ExperienceLevel, Reading } from "@/lib/reading/schema";
import { isAbroad } from "@/lib/geo/uk";
import { getOccupation, RULES_UPDATED_AT, type Occupation } from "./occupations";
import { annualise, parseSalary, plausibleAnnual, salaryFromDescription, type ParsedSalary, type SalaryPeriod } from "./salary";
import { classifySeniority, type Seniority } from "./seniority";
import { sponsorshipSignal } from "./signals";
import { fieldFromOccupation } from "./fields";
import { classifyOccupation } from "./soc";

/** Bump when the rules change, so every job is re-scored on the next run. */
export const SCORE_VERSION = 14;

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
  /** The job's location as the board gives it. */
  locationText?: string | null;
  /** AI classification for this title, when one exists (scripts/classify-jobs.ts). */
  aiSocCode?: string | null;
  aiField?: string | null;
  /** The AI reader's checked facts for the ad's current text (scripts/read-jobs.ts); null until read. */
  reading?: Reading | null;
  isNhsJobs: boolean;
  /** Linked to an active, A-rated sponsor on the Skilled Worker route. */
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
  /** The reason code that settled the stamp (for reports; the page shows every reason). */
  decidedBy: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  salaryAnnualMin: number | null;
  salaryAnnualMax: number | null;
  /** Pay against the occupation's new-entrant rate and general rate; null when it can't be told. */
  meetsNewEntrantRate: boolean | null;
  meetsGeneralRate: boolean | null;
  /** From the reader; null when unread or not stated. */
  experienceLevel: ExperienceLevel | null;
  experienceMinYears: number | null;
  closingDate: string | null;
  /** Whether the reader has read the ad's current text. Unread jobs aren't listed. */
  read: boolean;
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
/** Bank, locum, sessional and zero-hours work is never listed as sponsorable (founder's rule, 2026-10-28). */
const AS_NEEDED = /\b(bank (nurse|staff|worker|practitioner|role|shifts?|midwife|doctor|pharmacist|physiotherapist|radiographer|therapist)|^bank\b|zero[- ]hours?|sessional|locum)\b/i;
/** Only when part-time is the sole pattern: "Full time, Part time" ads can be worked full time. */
const PART_TIME = /\bpart[- ]?time\b/i;
const FULL_TIME = /\bfull[- ]?time\b/i;

/** Contracts the reader can find that are never sponsorable here, and why. */
const BLOCKED_CONTRACT: Partial<Record<ContractType, string>> = {
  bank: "a bank (as-needed) contract",
  locum: "a locum contract",
  sessional: "sessional work",
  zero_hours: "a zero-hours contract",
  temporary: "temporary cover",
  contractor: "a contractor (day-rate) role",
  self_employed: "self-employed or freelance work",
  internship: "an internship or placement",
  apprenticeship: "an apprenticeship",
};
/** Fixed-term contracts shorter than this aren't listed as sponsorable (founder's rule, 2026-10-28). */
const MIN_FIXED_TERM_MONTHS = 12;

/** NHS Agenda for Change band: graduate-level registered roles start at Band 5. */
const nhsBand = (salaryText: string | null) => {
  const m = /\bband\s+([1-9])\b/i.exec(salaryText ?? "");
  return m ? Number(m[1]) : null;
};

/** The reader's quote that says no, rather than NHS Jobs' "applicants are welcome" line next to it. */
const noQuote = (quotes: string[]) => quotes.find((q) => /\b(not|no|unable|cannot|can't|won't|doesn't)\b/i.test(q.replace(/[‘’]/g, "'"))) ?? quotes[0];

/** Facts only: every reason states what was found, never what a visa outcome will be. */
export function scoreJob(input: ScoreInput): ScoreResult {
  const reasons: Reason[] = [];
  const reading = input.reading ?? null;
  const text = `${input.title}\n${input.salaryText ?? ""}\n${input.description ?? ""}`;

  // Salary: structured fields from the ATS first, then what the reader found, then the advertised
  // text, then the description. Values are only trusted when plausible as UK pay.
  const structured: ParsedSalary | null =
    input.salaryMin !== null && input.salaryPeriod && plausibleAnnual(annualise(input.salaryMin, input.salaryPeriod))
      ? {
          min: input.salaryMin,
          max: input.salaryMax !== null && plausibleAnnual(annualise(input.salaryMax, input.salaryPeriod)) ? input.salaryMax : input.salaryMin,
          period: input.salaryPeriod,
        }
      : null;
  const read = reading?.salary;
  const fromReading: ParsedSalary | null =
    read && plausibleAnnual(annualise(read.max, read.period)) ? (read.upToOnly ? { min: read.max, max: read.max, period: read.period, ceilingOnly: true } : { min: read.min, max: read.max, period: read.period }) : null;
  const parsed = structured ?? fromReading ?? parseSalary(input.salaryText, { envelope: true }) ?? salaryFromDescription(input.description);
  // "Up to £45,000" says nothing about the starting pay.
  const annualMin = parsed && !parsed.ceilingOnly ? annualise(parsed.min, parsed.period) : null;
  const annualMax = parsed ? annualise(parsed.max, parsed.period) : null;

  const { seniority, isGradScheme, isInternship, isApprenticeship } = classifySeniority(input.title, input.description, input.salaryText);
  // The reader reads the whole ad; then the per-title AI classification; the keyword rules are the fallback.
  const aiSoc = [reading?.socCode, input.aiSocCode].find((c) => c && getOccupation(c)) ?? null;
  const socCode = aiSoc ?? classifyOccupation(input.title, input.sector);
  const occupation: Occupation | null = getOccupation(socCode);
  const signal = sponsorshipSignal(text);
  const experience = reading && reading.experience.level !== "not_stated" ? reading.experience : null;

  let meetsNewEntrantRate: boolean | null = null;
  let meetsGeneralRate: boolean | null = null;
  // A hard stop records its reason just before returning, so by default the last one decided.
  const result = (sponsorability: Sponsorability, decidedBy = reasons.at(-1)?.code ?? null): ScoreResult => ({
    socCode,
    field: reading?.field ?? input.aiField ?? fieldFromOccupation(socCode, input.title),
    seniority,
    isGradScheme,
    sponsorability,
    reasons,
    decidedBy,
    salaryMin: parsed && !parsed.ceilingOnly ? parsed.min : null,
    salaryMax: parsed?.max ?? null,
    salaryPeriod: parsed?.period ?? null,
    salaryAnnualMin: annualMin,
    salaryAnnualMax: annualMax,
    meetsNewEntrantRate,
    meetsGeneralRate,
    experienceLevel: experience?.level ?? null,
    experienceMinYears: experience?.minYears ?? null,
    closingDate: reading?.closingDate ?? null,
    read: reading !== null,
  });

  // Sponsor licence
  if (input.licensedSponsor) {
    reasons.push({ code: "licensed_sponsor", message: `${input.sponsorName ?? "The employer"} is on the register of licensed Skilled Worker sponsors.` });
  } else {
    reasons.push({ code: "sponsor_not_confirmed", message: "We couldn't match this employer to the register of licensed sponsors." });
  }
  if (experience) {
    if (experience.level === "graduate_or_entry") reasons.push({ code: "experience_graduate", message: "The ad describes this as a graduate or entry-level role." });
    else {
      const asked = experience.minYears ? `${experience.minYears}+ years of experience` : experience.level === "senior" ? "a senior level of experience" : "previous experience";
      reasons.push({ code: "experience_required", message: `The ad asks for ${asked}.` });
    }
  }

  // Only jobs based in the UK are listed. The board's own offices can't vouch for a job based abroad.
  // Readings stored before 2026-10-31 have no location fact.
  const abroadQuote = reading?.location?.place === "abroad" ? reading.location.quote : null;
  if (abroadQuote || isAbroad(input.locationText)) {
    reasons.push({ code: "location_outside_uk", message: `This job is based outside the UK${abroadQuote ? `: “${abroadQuote}”` : ` (${input.locationText})`}.` });
    return result("ineligible");
  }

  // Hard stops: what the ad says first. A "no" from the reader or the phrase rules wins over any "yes".
  const status = reading?.sponsorship.status;
  if (signal.negative || (status === "not_offered" && reading!.sponsorship.verified)) {
    reasons.push({ code: "ad_says_no_sponsorship", message: `The ad says sponsorship isn't available: “${signal.negative ?? noQuote(reading!.sponsorship.quotes)}”` });
    return result("ineligible");
  }
  // A "no" we couldn't confirm in the ad's words never becomes green.
  const unconfirmedNo = status === "not_offered";
  if (unconfirmedNo) reasons.push({ code: "ad_no_sponsorship_unconfirmed", message: "The ad may say sponsorship isn't available for this role, but we couldn't confirm its wording. Check with the employer." });
  const readerConditional = status === "offered_with_conditions" || status === "not_offered_with_conditions";
  const conditional = signal.conditional ?? (readerConditional ? reading!.sponsorship.quotes[0] ?? null : null);
  if (conditional || readerConditional) {
    reasons.push({ code: "ad_sponsorship_conditional", message: conditional ? `The ad says sponsorship depends on the role or the applicant: “${conditional}”` : "The ad says sponsorship depends on the role or the applicant." });
  }

  // Contract and hours: casual, short, freelance and part-time work is never listed as sponsorable.
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
  if (isInternship) {
    reasons.push({ code: "internship", message: "Internships and placements are usually too short for Skilled Worker sponsorship." });
    return result("ineligible");
  }
  if (isApprenticeship) {
    reasons.push({ code: "apprenticeship", message: "Apprenticeships are training schemes and are rarely sponsored under the Skilled Worker route." });
    return result("ineligible");
  }
  if (AS_NEEDED.test(input.title) || /^\s*(bank|locum)\b/i.test(input.employmentType ?? "")) {
    reasons.push({ code: "as_needed_contract", message: "Bank, locum, sessional and zero-hours roles are short-term or as-needed work, which this site doesn't list as sponsorable." });
    return result("ineligible");
  }
  const blocked = reading ? BLOCKED_CONTRACT[reading.contract.type] : undefined;
  if (blocked) {
    reasons.push({ code: "contract_not_sponsorable", message: `The ad describes ${blocked}${reading!.contract.quote ? ` (“${reading!.contract.quote}”)` : ""}, which this site doesn't list as sponsorable.` });
    return result("ineligible");
  }
  const months = reading?.contract.type === "fixed_term" ? reading.contract.fixedTermMonths : null;
  if (months !== null && months < MIN_FIXED_TERM_MONTHS) {
    reasons.push({ code: "fixed_term_short", message: `This is a ${months}-month fixed-term contract; this site lists fixed-term roles of ${MIN_FIXED_TERM_MONTHS} months or more.` });
    return result("ineligible");
  }
  if ((PART_TIME.test(contract) && !FULL_TIME.test(contract)) || /\bactual\s+£/i.test(input.salaryText ?? "") || reading?.hours.pattern === "part_time") {
    reasons.push({ code: "part_time", message: "This is a part-time post, which this site doesn't list as sponsorable: the Skilled Worker salary rule applies to the pay actually received." });
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

  // Occupation and salary, against both rates.
  const band = nhsBand(input.salaryText);
  // Bands only mean Agenda for Change on NHS posts and in pay-scale occupations, not an employer's own grades.
  const lowBand = band !== null && band < 5 && (input.isNhsJobs || occupation?.eligibility === "national_pay_scale");
  if (occupation?.eligibility === "national_pay_scale") {
    reasons.push({ code: "national_pay_scale", message: `${occupation.title} (SOC ${occupation.soc}) is paid on a national pay scale; NHS rates meet the Skilled Worker rules for this occupation.` });
    if (lowBand) {
      reasons.push({ code: "nhs_band_below_5", message: `This post is Band ${band}. Registered, graduate-level NHS roles in this occupation start at Band 5, so check the role with the employer.` });
    } else if (input.isNhsJobs || band !== null || /\bagenda for change\b/i.test(input.salaryText ?? "")) {
      // NHS posts are paid on the scale. Elsewhere (pharma, private hospitals) compare with the scale figure.
      meetsNewEntrantRate = meetsGeneralRate = true;
    } else if (occupation.goingRate && annualMin !== null && annualMin >= occupation.goingRate) meetsNewEntrantRate = meetsGeneralRate = true;
  } else if (occupation?.eligibility === "eligible" && occupation.newEntrantRate) {
    const rate = occupation.newEntrantRate;
    if (annualMin !== null && annualMin >= rate) {
      meetsNewEntrantRate = true;
      reasons.push({ code: "salary_meets_new_entrant", message: `Salary from ${gbp(annualMin)} a year is at or above the ${gbp(rate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}).` });
    } else if (annualMax !== null && annualMax < rate) {
      meetsNewEntrantRate = false;
      reasons.push({ code: "salary_below_new_entrant", message: `Salary up to ${gbp(annualMax)} a year is below the ${gbp(rate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}).` });
    } else if (annualMin === null && annualMax !== null) {
      reasons.push({ code: "salary_ceiling_only", message: `The ad gives pay of up to ${gbp(annualMax)} a year but no starting figure. New entrants in ${occupation.title} (SOC ${occupation.soc}) need at least ${gbp(rate)}, so the offer would need to be at or above it.` });
    } else if (annualMin === null) {
      reasons.push({ code: "salary_unknown", message: `No salary in the ad. New entrants in ${occupation.title} (SOC ${occupation.soc}) need at least ${gbp(rate)} a year (rules as of ${rulesDate}).` });
    } else {
      reasons.push({ code: "salary_range_spans_rate", message: `The salary range spans the ${gbp(rate)} new-entrant rate for ${occupation.title} (SOC ${occupation.soc}); the offer would need to be at or above it.` });
    }
    const general = occupation.generalRate;
    if (general !== null) {
      if (annualMin !== null && annualMin >= general) meetsGeneralRate = true;
      else if (annualMax !== null && annualMax < general) meetsGeneralRate = false;
      if (meetsNewEntrantRate && meetsGeneralRate) {
        reasons.push({ code: "salary_meets_general", message: `It also meets the ${gbp(general)} general rate, which applies to people who aren't new entrants.` });
      } else if (meetsNewEntrantRate && meetsGeneralRate === false) {
        reasons.push({ code: "salary_below_general", message: `It's below the ${gbp(general)} general rate, which applies to people who aren't new entrants (new entrants include people switching from a Student or Graduate visa).` });
      }
    }
  } else if (occupation?.eligibility === "limited") {
    reasons.push({ code: "occupation_limited", message: `${occupation.title} (SOC ${occupation.soc}) is only eligible in limited cases, such as occupations on the Temporary Shortage List.` });
  } else {
    reasons.push({ code: "occupation_unknown", message: "We couldn't match the job title to an occupation code, so the salary rule couldn't be checked." });
  }

  // What the ad offers. Recorded before deciding, so the reasons always show it.
  const offerQuote = reading ? (status === "offered" && reading.sponsorship.verified ? reading.sponsorship.quotes[0] : null) : signal.positive;
  if (offerQuote) reasons.push({ code: "ad_mentions_sponsorship", message: `The ad mentions sponsorship: “${offerQuote}”` });
  if (signal.nhsStatement) reasons.push({ code: "nhs_sponsorship_statement", message: `The employer ticked NHS Jobs' Certificate of Sponsorship option for this post: “${signal.nhsStatement}”` });
  if (!reading && signal.hedged && !signal.positive) reasons.push({ code: "ad_sponsorship_maybe", message: `The ad says sponsorship might be possible: “${signal.hedged}”` });
  const offered = offerQuote !== null || signal.nhsStatement !== null;

  // The rules come first: what the ad says can't outweigh a failed or unconfirmed check.
  const firstOf = (...codes: string[]) => reasons.find((r) => codes.includes(r.code))?.code ?? null;
  const salaryCodes = ["salary_below_new_entrant", "salary_range_spans_rate", "salary_unknown", "salary_ceiling_only", "occupation_unknown"];
  if (meetsNewEntrantRate === false) return result("ineligible", firstOf("salary_below_new_entrant"));
  if (!input.licensedSponsor) return result("unknown", firstOf("sponsor_not_confirmed"));
  if (unconfirmedNo || conditional || readerConditional) return result("check_with_employer", firstOf("ad_no_sponsorship_unconfirmed", "ad_sponsorship_conditional"));
  if (occupation?.eligibility === "limited" || lowBand || meetsNewEntrantRate !== true) {
    return result("check_with_employer", firstOf("occupation_limited", "nhs_band_below_5", ...salaryCodes));
  }
  if (offered) return result("sponsorship_mentioned", firstOf("ad_mentions_sponsorship", "nhs_sponsorship_statement"));
  if (signal.rightToWorkOnly) {
    reasons.push({ code: "asks_right_to_work", message: "The ad asks for existing right to work in the UK, so check with the employer whether they'd sponsor this role." });
    return result("check_with_employer");
  }
  return result("likely_eligible", firstOf("salary_meets_new_entrant", "national_pay_scale"));
}
