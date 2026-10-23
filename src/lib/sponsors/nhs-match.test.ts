import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNhsMatcher } from "./nhs-match";

const register = [
  "Swansea Bay University Local Health Board",
  "University Hospital Southampton NHS Foundation Trust",
  "Sussex Community NHS FoundationTrust",
  "TEES, ESK & WEAR VALLEYS NHS TRUST",
  "University Hospitals North Midlands NHS Trust",
  "University Hospitals Sussex NHS Foundation Trust",
  "Liverpool Heart & Chest Hospital NHS Trust",
  "King's College Hospital NHS Foundation Trust",
  "Whittington Health",
  "Swansea bay home care services Ltd",
].map((name, i) => ({ id: i + 1, name }));
const match = createNhsMatcher(register);
const nameOf = (employer: string) => register.find((r) => r.id === match(employer))?.name ?? null;

describe("createNhsMatcher", () => {
  it("matches NHS Jobs spellings to the register", () => {
    assert.equal(nameOf("Swansea Bay University Health Board"), "Swansea Bay University Local Health Board");
    assert.equal(nameOf("University Hospital Southampton NHS Trust"), "University Hospital Southampton NHS Foundation Trust");
    assert.equal(nameOf("Sussex Community NHS Foundation Trust"), "Sussex Community NHS FoundationTrust");
    assert.equal(nameOf("Tees Esk and Wear Valleys NHS Foundation Trust"), "TEES, ESK & WEAR VALLEYS NHS TRUST");
    assert.equal(nameOf("University Hospital of North Midlands NHS Trust"), "University Hospitals North Midlands NHS Trust");
    assert.equal(nameOf("University Hospitals Sussex NHS Foundation Trust (279)"), "University Hospitals Sussex NHS Foundation Trust");
    assert.equal(nameOf("Liverpool Heart and Chest Hospital"), "Liverpool Heart & Chest Hospital NHS Trust");
    assert.equal(nameOf("King's College Hospital NHS Foundation Trust"), "King's College Hospital NHS Foundation Trust");
  });

  it("keeps different bodies apart and leaves unknowns unmatched", () => {
    assert.equal(nameOf("Whittington Hospital NHS Trust"), null);
    assert.equal(nameOf("Kettering General Hospital NHS Foundation Trust"), null);
    assert.equal(nameOf("Ripon Spa Surgery"), null);
  });
});
