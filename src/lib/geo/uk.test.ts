import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUkCountryCode, isUkLocation } from "./uk";

describe("isUkLocation", () => {
  it("recognises UK locations in the formats ATSes use", () => {
    for (const loc of [
      "London", "Cardiff, London or Remote (UK)", "Glasgow, Scotland, United Kingdom ", "Remote - UK", "Manchester, England",
      "Northampton, Barclays Campus, Pavilion Drive", "Knutsford, Radbroke Hall", "UK – London – New Oxford Street",
      "GB - Southampton", "Bristol Filton (UK-B)", "Hatfield, England, United Kingdom", "Leeds Wellington Place",
    ]) {
      assert.equal(isUkLocation(loc), true, loc);
    }
  });

  it("rejects foreign places, including UK-named ones abroad", () => {
    for (const loc of [
      "Boulder, Colorado, United States", "Köln", "London, Ontario, Canada", "Cambridge, MA", "Paris", "Ukraine", null,
      "US - Cambridge Kendall SQ - MA", "Washington, District of Columbia, United States", "Washington DC", "Boston",
      "Perth, Australia", "Sydney, New South Wales", "Manchester, NH", "Dublin", "Tashkent", "Remote", "IN-Bangalore",
    ]) {
      assert.equal(isUkLocation(loc), false, String(loc));
    }
  });
});

describe("isUkCountryCode", () => {
  it("accepts GB/UK codes", () => {
    assert.equal(isUkCountryCode("GB"), true);
    assert.equal(isUkCountryCode("gb"), true);
    assert.equal(isUkCountryCode("US"), false);
  });
});
