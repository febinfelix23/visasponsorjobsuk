import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatContract, formatSalary } from "./format";

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
