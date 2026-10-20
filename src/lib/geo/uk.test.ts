import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUkCountryCode, isUkLocation } from "./uk";

describe("isUkLocation", () => {
  it("recognises UK locations in the formats ATSes use", () => {
    for (const loc of ["London", "Cardiff, London or Remote (UK)", "Glasgow, Scotland, United Kingdom ", "Remote - UK", "Manchester, England"]) {
      assert.equal(isUkLocation(loc), true, loc);
    }
  });

  it("rejects foreign places, including UK-named ones abroad", () => {
    for (const loc of ["Boulder, Colorado, United States", "Köln", "London, Ontario, Canada", "Cambridge, MA", "Paris", "Ukraine", null]) {
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
