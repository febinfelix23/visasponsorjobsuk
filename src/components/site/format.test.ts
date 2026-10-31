import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BADGE, formatContract, formatExperience, formatSalary, shortLocation } from "./format";
import { initials } from "./monogram";

describe("formatContract", () => {
  it("turns ATS labels into plain words", () => {
    assert.equal(formatContract("FullTime"), "Full time");
    assert.equal(formatContract("Full-time"), "Full time");
    assert.equal(formatContract("Permanent - Employee"), "Permanent");
    assert.equal(formatContract(null), null);
  });
});

describe("formatSalary", () => {
  it("shows a single figure or a range", () => {
    assert.equal(formatSalary(48500, 48500), "£48,500");
    assert.equal(formatSalary(45000, 55000), "£45,000–£55,000");
    assert.equal(formatSalary(null, null), null);
  });
});

describe("shortLocation", () => {
  it("tidies ATS location strings", () => {
    assert.equal(shortLocation("London, , United Kingdom"), "London");
    assert.equal(shortLocation("Bristol, UK"), "Bristol");
    assert.equal(shortLocation("GB - Luton - Cap. Green 300"), "Luton");
    assert.equal(shortLocation("GB - Edinburgh; GB - Newcastle"), "Edinburgh or Newcastle");
    assert.equal(shortLocation("GB - Luton - Cap. Green 300; GB - Lincoln; GB - Southampton; GB - Basildon"), "Luton, Lincoln and 2 more");
    assert.equal(shortLocation("Cardiff, London or Remote (UK)"), "Cardiff, London or Remote (UK)");
    assert.equal(shortLocation("United Kingdom"), "United Kingdom");
    assert.equal(shortLocation(""), null);
    assert.equal(shortLocation(null), null);
  });
});

describe("initials", () => {
  it("takes the first letters of the two names that identify the employer", () => {
    assert.equal(initials("Wise Payments Limited"), "WP");
    assert.equal(initials("Monzo Bank Ltd"), "MB");
    assert.equal(initials("Mid and South Essex NHS Foundation Trust"), "MS");
    assert.equal(initials("Accenture (UK) Limited"), "A");
    assert.equal(initials("LSEG"), "L");
    assert.equal(initials("3M United Kingdom PLC"), "3U");
  });
});

describe("formatExperience", () => {
  it("labels the experience the ad asks for", () => {
    assert.equal(formatExperience("graduate_or_entry", null), "Graduate or entry level");
    assert.equal(formatExperience("some_experience", 2), "Experience: 2+ years");
    assert.equal(formatExperience("experienced", 1), "Experience: 1+ year");
    assert.equal(formatExperience("experienced", null), "Experienced");
    assert.equal(formatExperience("senior", 5), "Senior");
    assert.equal(formatExperience(null, null), null);
  });
});

describe("BADGE", () => {
  it("calls a green offer what it is", () => {
    assert.equal(BADGE.sponsorship_mentioned.label, "Sponsorship offered");
  });
});
