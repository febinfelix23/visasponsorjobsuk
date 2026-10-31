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
  "Barts Health National Health Service Trust",
  "Central London Community Healthcare NHS Trust",
  "Leeds Teaching Hospitals NHS Trust",
  "Chelsea & Westminster NHS Foundation Trust",
  "Rotherham Doncaster and South Humber NHS Foundation Trust",
  "Westminster Drug Project",
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

  it("matches names the register spells out or abbreviates differently", () => {
    assert.equal(nameOf("Barts Health NHS Trust"), "Barts Health National Health Service Trust");
    assert.equal(nameOf("Central London Community Health Trust"), "Central London Community Healthcare NHS Trust");
    assert.equal(nameOf("Leeds Teaching Hospitals"), "Leeds Teaching Hospitals NHS Trust");
    assert.equal(nameOf("Chelsea and Westminster Hospital NHS Foundation Trust"), "Chelsea & Westminster NHS Foundation Trust");
    assert.equal(nameOf("Rotherham Doncaster and South Humber NHSFT"), "Rotherham Doncaster and South Humber NHS Foundation Trust");
  });

  it("allows only an extra 'hospital', never other extra words", () => {
    assert.equal(nameOf("Westminster Hospital NHS Trust"), null);
    assert.equal(nameOf("Chelsea and Westminster Children's NHS Foundation Trust"), null);
  });

  it("keeps different bodies apart and leaves unknowns unmatched", () => {
    assert.equal(nameOf("Whittington Hospital NHS Trust"), null);
    assert.equal(nameOf("Kettering General Hospital NHS Foundation Trust"), null);
    assert.equal(nameOf("Ripon Spa Surgery"), null);
  });
});
