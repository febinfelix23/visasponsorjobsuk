import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAbroad, isUkCountryCode, isUkLocation } from "./uk";

describe("isUkLocation", () => {
  it("recognises UK locations in the formats ATSes use", () => {
    for (const loc of [
      "London", "Cardiff, London or Remote (UK)", "Glasgow, Scotland, United Kingdom ", "Remote - UK", "Manchester, England",
      "Northampton, Barclays Campus, Pavilion Drive", "Knutsford, Radbroke Hall", "UK – London – New Oxford Street",
      "GB - Southampton", "Bristol Filton (UK-B)", "Hatfield, England, United Kingdom", "Leeds Wellington Place", "Denmark Hill, SE5 8AZ",
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

describe("isAbroad", () => {
  it("says a location is abroad when every place in it is clearly outside the UK", () => {
    for (const loc of ["Melbourne, Victoria, Australia", "Madrid", "Melbourne, Australia", "Zurich, Switzerland", "Sweden (Remote)", "Houston, Texas, United States", "Bethesda, Maryland, United States; Vancouver, Washington, United States", "Berlin", "Paris", "Toronto; New York", "US - Austin - TX"]) {
      assert.equal(isAbroad(loc), true, loc);
    }
  });

  it("doesn't call a location abroad when any part is in the UK, or when it can't tell", () => {
    for (const loc of ["Dublin, Ireland; London", "New York; London", "London", "Melbourne", "Melbourne, Derbyshire", "Remote", "EMEA", "Northumbria", "3 Locations", "", null,
      // Live false alarms, 2026-10-31: a work-pattern word, a city list with London, a London NHS site.
      "In-Office", "London, Paris, New York", "Denmark Hill, SE5 8AZ"]) {
      assert.equal(isAbroad(loc), false, String(loc));
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
