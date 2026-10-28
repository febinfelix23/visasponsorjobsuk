import { FIELDS, isFieldKey, type FieldKey } from "@/lib/scoring/fields";
import { getOccupation } from "@/lib/scoring/occupations";
import { quoteIsInAd } from "./quotes";

/**
 * What the AI reader reports about one ad, and the checks its answer must pass. Every
 * fact carries a quote from the ad; a fact whose quote isn't in the ad is treated as
 * not stated (see quotes.ts). Rules in scoring/score.ts decide the stamp from these.
 */

export const SPONSORSHIP = ["offered", "offered_with_conditions", "not_offered", "not_offered_with_conditions", "not_mentioned"] as const;
export const CONTRACT = ["permanent", "fixed_term", "bank", "locum", "sessional", "zero_hours", "temporary", "contractor", "self_employed", "internship", "apprenticeship", "not_stated"] as const;
export const HOURS = ["full_time", "part_time", "full_or_part_time", "not_stated"] as const;
export const EXPERIENCE = ["graduate_or_entry", "some_experience", "experienced", "senior", "not_stated"] as const;
const PERIODS = ["year", "month", "week", "day", "hour"] as const;
const BASIS = ["actual", "full_time_equivalent", "not_stated"] as const;

export type SponsorshipStatus = (typeof SPONSORSHIP)[number];
export type ContractType = (typeof CONTRACT)[number];
export type HoursPattern = (typeof HOURS)[number];
export type ExperienceLevel = (typeof EXPERIENCE)[number];

export type Reading = {
  /** `verified` is false when no quote checked out; an unproven "no" still blocks a green stamp. */
  sponsorship: { status: SponsorshipStatus; verified: boolean; quotes: string[] };
  contract: { type: ContractType; fixedTermMonths: number | null; quote: string | null };
  hours: { pattern: HoursPattern; hoursPerWeek: number | null; quote: string | null };
  salary: { min: number; max: number; period: (typeof PERIODS)[number]; basis: (typeof BASIS)[number]; upToOnly: boolean; quote: string } | null;
  experience: { level: ExperienceLevel; minYears: number | null; quote: string | null };
  closingDate: string | null;
  socCode: string | null;
  field: FieldKey | null;
};

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;

/** JSON schema the model must answer in (structured output). */
export const READING_SCHEMA = {
  type: "object",
  properties: {
    sponsorship: {
      type: "object",
      properties: { status: { type: "string", enum: SPONSORSHIP }, quotes: { type: "array", items: { type: "string" } } },
      required: ["status", "quotes"],
      additionalProperties: false,
    },
    contract: {
      type: "object",
      properties: { type: { type: "string", enum: CONTRACT }, fixed_term_months: nullableNumber, quote: nullableString },
      required: ["type", "fixed_term_months", "quote"],
      additionalProperties: false,
    },
    hours: {
      type: "object",
      properties: { pattern: { type: "string", enum: HOURS }, hours_per_week: nullableNumber, quote: nullableString },
      required: ["pattern", "hours_per_week", "quote"],
      additionalProperties: false,
    },
    salary: {
      type: "object",
      properties: {
        min: nullableNumber,
        max: nullableNumber,
        period: { anyOf: [{ type: "string", enum: PERIODS }, { type: "null" }] },
        basis: { type: "string", enum: BASIS },
        up_to_only: { type: "boolean" },
        quote: nullableString,
      },
      required: ["min", "max", "period", "basis", "up_to_only", "quote"],
      additionalProperties: false,
    },
    experience: {
      type: "object",
      properties: { level: { type: "string", enum: EXPERIENCE }, min_years: nullableNumber, quote: nullableString },
      required: ["level", "min_years", "quote"],
      additionalProperties: false,
    },
    closing_date: {
      type: "object",
      properties: { date: nullableString, quote: nullableString },
      required: ["date", "quote"],
      additionalProperties: false,
    },
    occupation: {
      type: "object",
      properties: { soc: { type: "string" }, field: { type: "string", enum: FIELDS.map((f) => f.key) } },
      required: ["soc", "field"],
      additionalProperties: false,
    },
  },
  required: ["sponsorship", "contract", "hours", "salary", "experience", "closing_date", "occupation"],
  additionalProperties: false,
} as const;

type Raw = Record<string, Record<string, unknown> | undefined>;

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null => (list as readonly unknown[]).includes(value) ? (value as T) : null;
const numberIn = (value: unknown, min: number, max: number) => (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The model's JSON answer as checked facts, or null when it isn't usable. */
export function parseReading(answer: string, ad: string): Reading | null {
  let raw: Raw;
  try {
    raw = JSON.parse(answer);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const inAd = (quote: string | null) => quote !== null && quoteIsInAd(quote, ad);

  const status = oneOf(SPONSORSHIP, raw.sponsorship?.status) ?? "not_mentioned";
  const quotes = (Array.isArray(raw.sponsorship?.quotes) ? raw.sponsorship.quotes : []).map(text).filter((q): q is string => inAd(q));

  const contractQuote = text(raw.contract?.quote);
  const contractType = inAd(contractQuote) ? oneOf(CONTRACT, raw.contract?.type) : null;
  const hoursQuote = text(raw.hours?.quote);
  const hoursPattern = inAd(hoursQuote) ? oneOf(HOURS, raw.hours?.pattern) : null;
  const experienceQuote = text(raw.experience?.quote);
  const experienceLevel = inAd(experienceQuote) ? oneOf(EXPERIENCE, raw.experience?.level) : null;

  const s = raw.salary;
  const salaryQuote = text(s?.quote);
  const salaryMin = numberIn(s?.min, 1, 1_000_000);
  const salaryMax = numberIn(s?.max, 1, 1_000_000) ?? salaryMin;
  const period = oneOf(PERIODS, s?.period);
  const salary =
    inAd(salaryQuote) && salaryMin !== null && salaryMax !== null && salaryMax >= salaryMin && period
      ? { min: salaryMin, max: salaryMax, period, basis: oneOf(BASIS, s?.basis) ?? "not_stated", upToOnly: s?.up_to_only === true, quote: salaryQuote! }
      : null;

  const date = text(raw.closing_date?.date);
  const closingDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && inAd(text(raw.closing_date?.quote)) ? date : null;
  const soc = text(raw.occupation?.soc);

  return {
    sponsorship: { status, verified: status === "not_mentioned" || quotes.length > 0, quotes },
    contract: { type: contractType ?? "not_stated", fixedTermMonths: contractType ? numberIn(raw.contract?.fixed_term_months, 1, 120) : null, quote: contractType ? contractQuote : null },
    hours: { pattern: hoursPattern ?? "not_stated", hoursPerWeek: hoursPattern ? numberIn(raw.hours?.hours_per_week, 1, 80) : null, quote: hoursPattern ? hoursQuote : null },
    salary,
    experience: { level: experienceLevel ?? "not_stated", minYears: experienceLevel ? numberIn(raw.experience?.min_years, 0, 40) : null, quote: experienceLevel ? experienceQuote : null },
    closingDate,
    socCode: soc && getOccupation(soc) ? soc : null,
    field: isFieldKey(raw.occupation?.field) ? raw.occupation.field : null,
  };
}
