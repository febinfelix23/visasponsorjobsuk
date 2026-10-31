import type { Reading } from "./schema";

/**
 * Measuring the reader against hand-labelled ads (data/eval/reading-labels.json) before its
 * facts decide stamps. The measures follow the decisions the stamps make: whether a "no" is
 * caught, and whether a contract or working pattern rules a job out.
 */

export type EvalLabel = {
  id: number;
  /** What the ad says about sponsorship. */
  sponsorship: "no" | "cond" | "yes" | "none";
  /** "blocked": casual, short or freelance work; "?": the ad is too vague to label. */
  contract: "blocked" | "ok" | "?";
  hours: "pt" | "ok" | "?";
  /** Set on ads labelled as based outside the UK; every other ad is expected not to be read as abroad. */
  abroad?: boolean;
};

export type EvalResult = { id: number; reading: Reading; rulesSayNo: boolean };

export const emptyReading = (): Reading => ({
  sponsorship: { status: "not_mentioned", verified: true, quotes: [] },
  contract: { type: "not_stated", fixedTermMonths: null, quote: null },
  hours: { pattern: "not_stated", hoursPerWeek: null, quote: null },
  salary: null,
  experience: { level: "not_stated", minYears: null, quote: null },
  closingDate: null,
  location: { place: "not_stated", quote: null },
  socCode: null,
  field: null,
});

const BLOCKING: Reading["contract"]["type"][] = ["bank", "locum", "sessional", "zero_hours", "temporary", "contractor", "self_employed", "internship", "apprenticeship"];
const blocks = (r: Reading) => BLOCKING.includes(r.contract.type) || (r.contract.type === "fixed_term" && r.contract.fixedTermMonths !== null && r.contract.fixedTermMonths < 12);

export function evaluateReadings(labels: EvalLabel[], results: EvalResult[]) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const m = { noTotal: 0, noCaught: 0, noCaughtByReader: 0, noMissed: [] as number[], falseNo: [] as number[], contractTotal: 0, contractRight: 0, contractWrong: [] as number[], hoursTotal: 0, hoursRight: 0, hoursWrong: [] as number[], falseOffer: [] as number[], abroadTotal: 0, abroadCaught: 0, falseAbroad: [] as number[] };
  for (const label of labels) {
    const result = byId.get(label.id);
    if (!result) continue;
    const readerNo = result.reading.sponsorship.status === "not_offered";
    const saysNo = readerNo || result.rulesSayNo;
    if (label.sponsorship === "no") {
      m.noTotal++;
      if (saysNo) m.noCaught++;
      else m.noMissed.push(label.id);
      if (readerNo) m.noCaughtByReader++;
    } else if (saysNo) m.falseNo.push(label.id);
    // An offer read into a "no" or conditional ad is the mistake that could make a job green.
    if ((label.sponsorship === "no" || label.sponsorship === "cond") && result.reading.sponsorship.status === "offered") m.falseOffer.push(label.id);
    const readAbroad = result.reading.location?.place === "abroad";
    if (label.abroad) {
      m.abroadTotal++;
      if (readAbroad) m.abroadCaught++;
    } else if (readAbroad) m.falseAbroad.push(label.id);
    if (label.contract !== "?") {
      m.contractTotal++;
      if (blocks(result.reading) === (label.contract === "blocked")) m.contractRight++;
      else m.contractWrong.push(label.id);
    }
    if (label.hours !== "?") {
      m.hoursTotal++;
      if ((result.reading.hours.pattern === "part_time") === (label.hours === "pt")) m.hoursRight++;
      else m.hoursWrong.push(label.id);
    }
  }
  return m;
}

/**
 * The gate: at least 98% of "no" statements caught and 95% right on contract and hours (agreed
 * in the design), no "no" or conditional ad read as an offer, every job abroad caught and no UK
 * job read as abroad (added 2026-10-31).
 */
export function passesGate(m: Pick<ReturnType<typeof evaluateReadings>, "noCaught" | "noTotal" | "contractRight" | "contractTotal" | "hoursRight" | "hoursTotal" | "falseOffer" | "abroadCaught" | "abroadTotal" | "falseAbroad">): boolean {
  return (
    m.noCaught >= 0.98 * m.noTotal &&
    m.contractRight >= 0.95 * m.contractTotal &&
    m.hoursRight >= 0.95 * m.hoursTotal &&
    m.falseOffer.length === 0 &&
    m.abroadCaught === m.abroadTotal &&
    m.falseAbroad.length === 0
  );
}
