import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReviewPrompt, createBoardReviewer, parseReviewText } from "./ai-review";

describe("buildReviewPrompt", () => {
  it("puts the sponsor's facts next to how the board describes itself", () => {
    const prompt = buildReviewPrompt({
      sponsor: { name: "Spire Healthcare Ltd", tradingName: null, town: "London", county: null, sector: "healthcare", sicCodes: ["86101"] },
      board: { ats: "greenhouse", identifier: "spire", boardName: "Spire", about: "Spire builds satellites", sampleTitles: ["Satellite Operations Engineer"], sampleLocations: ["Glasgow"] },
    });
    for (const fact of ["Spire Healthcare Ltd", "86101", "healthcare", "Spire builds satellites", "Satellite Operations Engineer", "Glasgow", "greenhouse: spire"]) {
      assert.ok(prompt.includes(fact), fact);
    }
  });
});

describe("parseReviewText", () => {
  it("accepts the three verdicts and rejects anything else", () => {
    assert.deepEqual(parseReviewText('{"verdict":"same","reason":"UK entity of the same brand"}'), { verdict: "same", reason: "UK entity of the same brand" });
    assert.equal(parseReviewText('{"verdict":"maybe","reason":"x"}'), null);
    assert.equal(parseReviewText("not json"), null);
    assert.deepEqual(parseReviewText('{"verdict":"unsure"}'), { verdict: "unsure", reason: "" });
  });
});

describe("createBoardReviewer", () => {
  it("is off without an API key", () => {
    assert.equal(createBoardReviewer({ apiKey: "" }), null);
  });
});
