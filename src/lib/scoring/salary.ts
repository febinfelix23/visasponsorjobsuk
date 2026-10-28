export type SalaryPeriod = "year" | "month" | "week" | "day" | "hour";
/** `ceilingOnly`: the ad gives only a top figure ("up to £45,000"), so the starting pay is unknown. */
export type ParsedSalary = { min: number; max: number; period: SalaryPeriod; ceilingOnly?: boolean };

// Skilled Worker salary checks assume a full-time working pattern.
const ANNUAL_MULTIPLIER: Record<SalaryPeriod, number> = { year: 1, month: 12, week: 52, day: 260, hour: 1950 };

export const annualise = (amount: number, period: SalaryPeriod) => Math.round(amount * ANNUAL_MULTIPLIER[period]);

const MIN_ANNUAL = 10_000;
const MAX_ANNUAL = 500_000;

/** Pay is only believable as UK salary within these bounds (rules out £0, bonuses, revenue). */
export const plausibleAnnual = (annual: number) => annual >= MIN_ANNUAL && annual <= MAX_ANNUAL;

const AMOUNT = String.raw`£\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s?(k|K)?`;
const RANGE = new RegExp(`${AMOUNT}(?:\\s?(?:-|–|—|to)\\s?(?:£\\s?)?(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)\\s?(k|K)?)?`, "g");

function toNumber(raw: string, k: string | undefined): number {
  const n = Number(raw.replace(/,/g, ""));
  return k ? n * 1000 : n;
}

function periodNear(text: string, index: number, amount: number): SalaryPeriod | null {
  // Same phrase only: "£31,900 starting salary plus £3000 bonus.\n\n5 days per week" must not read as weekly pay.
  const window = text.slice(index, index + 60).split(/\n|£|\.\s/)[0].toLowerCase();
  if (/(per|an|\/|a)\s?(hour|hr)\b|hourly|p\/h|ph\b/.test(window)) return "hour";
  if (/(per|a|\/)\s?day\b|daily|day rate|p\/d|pd\b/.test(window)) return "day";
  if (/(per|a|\/)\s?week\b|weekly/.test(window)) return "week";
  if (/(per|a|\/)\s?month\b|monthly|pcm/.test(window)) return "month";
  // No unit given: only a salary-sized figure counts (as annual). A bare "£450" is no evidence of pay.
  return amount >= 10_000 ? "year" : null;
}

/**
 * Finds a salary in advertised text: "£45,000 - £55,000 per annum", "£42k",
 * "£22.50 per hour", "Band 5 · £32,073 to £39,043 a year". Returns null for
 * "Competitive"/"Negotiable" or anything implausible as UK pay.
 *
 * With `envelope`, for a dedicated salary field, every figure with the same pay period
 * counts: "London £45,000; elsewhere £38,000" is £38,000–£45,000, not just the first.
 */
export function parseSalary(text: string | null | undefined, options: { envelope?: boolean } = {}): ParsedSalary | null {
  if (!text) return null;
  let found: ParsedSalary | null = null;
  for (const m of text.matchAll(RANGE)) {
    const min = toNumber(m[1], m[2]);
    const max = m[3] ? toNumber(m[3], m[4] ?? m[2]) : min;
    if (!(min > 0) || max < min) continue;
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    // "£3000 joining bonus", "£2,500 relocation allowance", "£100K commission": not salary.
    // Up to two words may sit between the amount and the word: "£450 yearly allowance", "£3000 joining bonus".
    if (/^\s?([a-z-]+\s){0,2}(bonus|allowance|budget|stipend|voucher|credit|commission|ote)\b/i.test(after)) continue;
    if (/\b(ote|on target earnings)\s*:?\s*$/i.test(text.slice(Math.max(0, m.index! - 25), m.index!))) continue;
    // GP pay is quoted "per session" (one weekly session's annual pay), not a full-time salary.
    if (/^\s?(per|a|\/)\s?session/i.test(after)) continue;
    const period = periodNear(text, m.index! + m[0].length, min);
    if (!period) continue;
    // Ignore bonuses, budgets and company revenue ("£2bn", "£500 joining bonus").
    if (!plausibleAnnual(annualise(min, period))) continue;
    // An implausible top of range ("£40,000 - £4,000,000") is a typo: keep the believable floor.
    const top = plausibleAnnual(annualise(max, period)) ? max : min;
    if (/^\s?(bn|billion|m\b|million)/i.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 9))) continue;
    // "Up to £45,000" gives the top of the range only.
    const ceilingOnly = !m[3] && /\bup\s+to\s*$/i.test(text.slice(Math.max(0, m.index! - 10), m.index!));
    const salary: ParsedSalary = ceilingOnly ? { min, max: top, period, ceilingOnly } : { min, max: top, period };
    if (!options.envelope) return salary;
    if (!found) found = salary;
    else if (salary.period === found.period) {
      found = {
        min: Math.min(found.ceilingOnly ? Infinity : found.min, salary.ceilingOnly ? Infinity : salary.min),
        max: Math.max(found.max, salary.max),
        period: found.period,
        ...(found.ceilingOnly && salary.ceilingOnly ? { ceilingOnly: true } : {}),
      };
      if (!Number.isFinite(found.min)) found.min = found.max;
    }
  }
  return found;
}

/**
 * Salary from a description, only where it's introduced as pay, so figures like
 * "£2bn of assets" or "£100 learning budget" aren't mistaken for salary.
 */
export function salaryFromDescription(description: string | null | undefined): ParsedSalary | null {
  if (!description) return null;
  const cue = /(salary|pay|compensation|remuneration|base|package|per annum|p\.a\.|£\d{2},\d{3})[^\n£]{0,40}/gi;
  for (const m of description.matchAll(cue)) {
    const snippet = description.slice(m.index!, m.index! + 160);
    const parsed = parseSalary(snippet);
    if (parsed) return parsed;
  }
  return null;
}
