import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatContract, formatSalary, shortLocation } from "./format";

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
