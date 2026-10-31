import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteIsInAd } from "./quotes";
import { parseReading } from "./schema";
import { quoteSource, readerInput, readingCostUsd } from "./read-job";
import { budgetLeftUsd, projectMonthUsd } from "./budget";
import { emptyReading, evaluateReadings, passesGate, type EvalLabel } from "./eval";
import type { Reading } from "./schema";

// Invented ad text; the repo is public, so no scraped adverts in tests.
const AD = `Specialist Physiotherapist – Band 6
• Permanent, full time (37.5 hours per week)
We are unable to offer a Certificate of Sponsorship for this post.
Applicants’ experience: at least 2 years post-registration.
Salary £45,953 to £54,254 a year`;

describe("quoteIsInAd", () => {
  it("accepts a quote copied from the ad", () => {
    assert.equal(quoteIsInAd("We are unable to offer a Certificate of Sponsorship for this post.", AD), true);
  });

  it("ignores case, line breaks, bullets, typographic quotes and dashes", () => {
    assert.equal(quoteIsInAd("permanent, full time (37.5 hours per week)", AD), true);
    assert.equal(quoteIsInAd("Applicants' experience: at least 2 years", AD), true);
    assert.equal(quoteIsInAd("Specialist Physiotherapist - Band 6 Permanent, full time", AD), true);
  });

  it("accepts a quote without its closing full stop", () => {
    assert.equal(quoteIsInAd("unable to offer a Certificate of Sponsorship for this post", AD), true);
  });

  it("rejects words the ad doesn't contain", () => {
    assert.equal(quoteIsInAd("Visa sponsorship is available for this post.", AD), false);
    assert.equal(quoteIsInAd("We are able to offer a Certificate of Sponsorship for this post.", AD), false);
  });

  it("accepts a short quote when it's a whole field, like NHS Jobs' contract \"Permanent\"", () => {
    const source = "Staff Nurse\nPermanent\nBand 5 · £31,049 a year\nJoin our team. This post is permanent subject to funding.";
    assert.equal(quoteIsInAd("Permanent", source), true);
    // NHS Jobs' contract and working pattern are stored together: each is a whole value.
    assert.equal(quoteIsInAd("Part-time", "Permanent, Part-time\nJoin our team."), true);
    // A short fragment of a sentence proves nothing.
    assert.equal(quoteIsInAd("our team", source), false);
    assert.equal(quoteIsInAd("Permanent", "This post is permanent subject to funding."), false);
  });

  it("rejects quotes too short to prove anything", () => {
    assert.equal(quoteIsInAd("post", AD), false);
    assert.equal(quoteIsInAd("", AD), false);
  });

  it("accepts parts joined with an ellipsis only when each part is in the ad, in order", () => {
    assert.equal(quoteIsInAd("Permanent, full time … unable to offer a Certificate of Sponsorship", AD), true);
    assert.equal(quoteIsInAd("unable to offer a Certificate of Sponsorship ... Permanent, full time", AD), false);
    assert.equal(quoteIsInAd("Permanent, full time … sponsorship is available", AD), false);
  });
});

const answer = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    sponsorship: { status: "not_offered", quotes: ["We are unable to offer a Certificate of Sponsorship for this post."] },
    contract: { type: "permanent", fixed_term_months: null, quote: "Permanent, full time" },
    hours: { pattern: "full_time", hours_per_week: 37.5, quote: "full time (37.5 hours per week)" },
    salary: { min: 45953, max: 54254, period: "year", basis: "full_time_equivalent", up_to_only: false, quote: "Salary £45,953 to £54,254 a year" },
    experience: { level: "some_experience", min_years: 2, quote: "at least 2 years post-registration" },
    closing_date: { date: null, quote: null },
    occupation: { soc: "2221", field: "healthcare" },
    ...overrides,
  });

describe("parseReading", () => {
  it("keeps facts whose quotes are in the ad", () => {
    const r = parseReading(answer(), AD)!;
    assert.deepEqual(r.sponsorship, { status: "not_offered", verified: true, quotes: ["We are unable to offer a Certificate of Sponsorship for this post."] });
    assert.deepEqual([r.contract.type, r.hours.pattern, r.hours.hoursPerWeek, r.experience.level, r.experience.minYears], ["permanent", "full_time", 37.5, "some_experience", 2]);
    assert.deepEqual(r.salary, { min: 45953, max: 54254, period: "year", basis: "full_time_equivalent", upToOnly: false, quote: "Salary £45,953 to £54,254 a year" });
    assert.deepEqual([r.socCode, r.field], ["2221", "healthcare"]);
  });

  it("drops an offer the ad doesn't make", () => {
    const r = parseReading(answer({ sponsorship: { status: "offered", quotes: ["Visa sponsorship is available for this post."] } }), AD)!;
    assert.deepEqual(r.sponsorship, { status: "offered", verified: false, quotes: [] });
  });

  it("keeps an unproven 'no' as unverified, so it can still block a green stamp", () => {
    const r = parseReading(answer({ sponsorship: { status: "not_offered", quotes: ["Sponsorship is not available."] } }), AD)!;
    assert.deepEqual([r.sponsorship.status, r.sponsorship.verified], ["not_offered", false]);
  });

  it("treats a fact with an invented quote as not stated", () => {
    const r = parseReading(
      answer({
        contract: { type: "bank", fixed_term_months: null, quote: "Bank contract, as and when required" },
        hours: { pattern: "part_time", hours_per_week: 22.5, quote: "22.5 hours per week" },
        salary: { min: 60000, max: 60000, period: "year", basis: "actual", up_to_only: false, quote: "Salary £60,000" },
        experience: { level: "senior", min_years: 10, quote: "ten years of leadership" },
      }),
      AD,
    )!;
    assert.deepEqual([r.contract.type, r.hours.pattern, r.hours.hoursPerWeek, r.salary, r.experience.level, r.experience.minYears], ["not_stated", "not_stated", null, null, "not_stated", null]);
  });

  it("rejects values outside the allowed lists and the official occupation table", () => {
    const r = parseReading(answer({ sponsorship: { status: "maybe", quotes: [] }, contract: { type: "gig", fixed_term_months: null, quote: "Permanent, full time" }, occupation: { soc: "9999", field: "astrology" } }), AD)!;
    assert.deepEqual([r.sponsorship.status, r.contract.type, r.socCode, r.field], ["not_mentioned", "not_stated", null, null]);
  });

  it("only takes a closing date given as a real date with its quote", () => {
    const ad = `${AD}\nClosing date: 2 November 2026`;
    assert.equal(parseReading(answer({ closing_date: { date: "2026-11-02", quote: "Closing date: 2 November 2026" } }), ad)!.closingDate, "2026-11-02");
    assert.equal(parseReading(answer({ closing_date: { date: "2 Nov", quote: "Closing date: 2 November 2026" } }), ad)!.closingDate, null);
    assert.equal(parseReading(answer({ closing_date: { date: "2026-11-02", quote: "Closing date: 9 November 2026" } }), ad)!.closingDate, null);
  });

  it("ignores impossible numbers", () => {
    const r = parseReading(answer({ hours: { pattern: "full_time", hours_per_week: 400, quote: "full time (37.5 hours per week)" }, contract: { type: "fixed_term", fixed_term_months: -3, quote: "Permanent, full time" } }), AD)!;
    assert.deepEqual([r.hours.hoursPerWeek, r.contract.fixedTermMonths], [null, null]);
  });

  it("reads where the job is based, and drops an unproven 'abroad'", () => {
    const ad = `${AD}\nThis is a remote position based in Victoria, Australia.`;
    const abroad = parseReading(answer({ location: { place: "abroad", quote: "This is a remote position based in Victoria, Australia." } }), ad)!;
    assert.deepEqual(abroad.location, { place: "abroad", quote: "This is a remote position based in Victoria, Australia." });
    assert.equal(parseReading(answer({ location: { place: "abroad", quote: "Based in Sydney" } }), ad)!.location.place, "not_stated");
    assert.equal(parseReading(answer(), AD)!.location.place, "not_stated");
  });

  it("returns nothing for an answer that isn't JSON", () => {
    assert.equal(parseReading("not json", AD), null);
  });
});

describe("reader request", () => {
  const job = {
    title: "Specialist Physiotherapist",
    employer: "Example NHS Foundation Trust",
    employmentType: "Permanent, Part-time",
    salaryText: "Band 6 · £45,953 to £54,254 a year",
    closingDate: "2026-11-02",
    description: `${"Duties. ".repeat(2400)}We are unable to offer a Certificate of Sponsorship for this post.`,
  };

  it("sends the whole ad and the board's own fields", () => {
    const input = JSON.parse(readerInput(job));
    assert.equal(input.title, "Specialist Physiotherapist");
    assert.equal(input.board_fields.contract_and_working_pattern, "Permanent, Part-time");
    assert.equal(input.board_fields.salary, "Band 6 · £45,953 to £54,254 a year");
    assert.equal(input.board_fields.closing_date, "2026-11-02");
    assert.ok(input.ad.endsWith("We are unable to offer a Certificate of Sponsorship for this post."));
    assert.equal(input.ad.length, job.description.length);
  });

  it("checks quotes against the board's fields as well as the ad", () => {
    // "Part-time" may come only from NHS Jobs' working-pattern field.
    assert.ok(quoteIsInAd("Permanent, Part-time", quoteSource(job)));
  });

  it("prices usage at Claude Haiku 5.5 rates", () => {
    assert.equal(readingCostUsd({ inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }), 0.1);
    assert.equal(readingCostUsd({ inputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, outputTokens: 1_000_000 }), 0.51);
  });
});

describe("reading budget", () => {
  it("projects the month from what's been spent so far", () => {
    // 10 days into a 31-day month (1 Oct 00:00 → 11 Oct 00:00).
    assert.equal(projectMonthUsd(5, new Date("2026-10-11T00:00:00Z")), 15.5);
    // Too early in the month to project meaningfully: report the spend as it is.
    assert.equal(projectMonthUsd(0.4, new Date("2026-10-01T06:00:00Z")), 0.4);
  });

  it("stops reading once the month's spend reaches the cap", () => {
    assert.equal(budgetLeftUsd(14.2), 15 - 14.2);
    assert.equal(budgetLeftUsd(15.3), 0);
  });
});

describe("reader evaluation", () => {
  const label = (id: number, sponsorship: string, contract = "ok", hours = "ok") => ({ id, sponsorship, contract, hours }) as EvalLabel;
  const seen = (id: number, over: Partial<Reading> = {}, rulesSayNo = false) => ({ id, reading: { ...emptyReading(), ...over }, rulesSayNo });

  it("counts a 'no' as caught when the reader or the phrase rules find it", () => {
    const labels = [label(1, "no"), label(2, "no"), label(3, "no"), label(4, "none")];
    const results = [
      seen(1, { sponsorship: { status: "not_offered", verified: true, quotes: ["x"] } }),
      seen(2, {}, true),
      seen(3),
      seen(4, { sponsorship: { status: "not_offered", verified: true, quotes: ["x"] } }),
    ];
    const m = evaluateReadings(labels, results);
    assert.deepEqual([m.noCaught, m.noTotal, m.noMissed], [2, 3, [3]]);
    assert.deepEqual(m.falseNo, [4]);
    assert.equal(m.noCaughtByReader, 1);
  });

  it("scores contract and hours as blocking or not, skipping labels marked unclear", () => {
    const labels = [label(1, "none", "blocked", "pt"), label(2, "none", "ok", "ok"), label(3, "none", "?", "?"), label(4, "none", "blocked", "ok")];
    const results = [
      seen(1, { contract: { type: "locum", fixedTermMonths: null, quote: "x" }, hours: { pattern: "part_time", hoursPerWeek: 20, quote: "x" } }),
      seen(2, { contract: { type: "fixed_term", fixedTermMonths: 24, quote: "x" } }),
      seen(3, { contract: { type: "bank", fixedTermMonths: null, quote: "x" } }),
      // A 3-month fixed term blocks too.
      seen(4, { contract: { type: "fixed_term", fixedTermMonths: 3, quote: "x" } }),
    ];
    const m = evaluateReadings(labels, results);
    assert.deepEqual([m.contractRight, m.contractTotal, m.hoursRight, m.hoursTotal], [3, 3, 3, 3]);
  });

  it("flags any 'no' or conditional ad read as an offer, the mistake that could make a job green", () => {
    const labels = [label(1, "cond"), label(2, "no"), label(3, "yes"), label(4, "cond")];
    const offered = { sponsorship: { status: "offered" as const, verified: true, quotes: ["x"] } };
    const results = [seen(1, offered), seen(2, offered, true), seen(3, offered), seen(4, { sponsorship: { status: "not_offered_with_conditions", verified: true, quotes: ["x"] } })];
    assert.deepEqual(evaluateReadings(labels, results).falseOffer, [1, 2]);
  });

  it("counts jobs based abroad caught, and UK jobs wrongly read as abroad", () => {
    const labels = [{ ...label(1, "none"), abroad: true }, label(2, "none"), label(3, "none")];
    const abroad = { location: { place: "abroad" as const, quote: "x" } };
    const m = evaluateReadings(labels, [seen(1, abroad), seen(2, abroad), seen(3)]);
    assert.deepEqual([m.abroadCaught, m.abroadTotal, m.falseAbroad], [1, 1, [2]]);
  });

  it("passes the gate only at 98% of 'no' caught, 95% on contract and hours, and no false offers or false 'abroad'", () => {
    const ok = { noCaught: 49, noTotal: 50, contractRight: 95, contractTotal: 100, hoursRight: 19, hoursTotal: 20, falseOffer: [], abroadCaught: 1, abroadTotal: 1, falseAbroad: [] };
    assert.equal(passesGate(ok), true);
    assert.equal(passesGate({ ...ok, noCaught: 48 }), false);
    assert.equal(passesGate({ ...ok, contractRight: 94 }), false);
    assert.equal(passesGate({ ...ok, falseOffer: [7] }), false);
    assert.equal(passesGate({ ...ok, abroadCaught: 0 }), false);
    assert.equal(passesGate({ ...ok, falseAbroad: [7] }), false);
  });
});
