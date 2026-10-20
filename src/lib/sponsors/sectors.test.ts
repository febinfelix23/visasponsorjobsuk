import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseMatch, type ChCompany } from "./companies-house";
import { knownEmployerSector } from "./known-employers";
import {
  isLikelyCareProvider,
  isNhsBody,
  parseSicText,
  sectorFromName,
  sectorFromSicCodes,
  sicToSector,
  sizeBandFromAccounts,
} from "./sectors";
import { tagSponsor } from "./tagging";

describe("sicToSector", () => {
  it("maps each in-scope sector", () => {
    assert.equal(sicToSector("62020"), "tech");
    assert.equal(sicToSector("58290"), "tech");
    assert.equal(sicToSector("64191"), "finance");
    assert.equal(sicToSector("69201"), "finance");
    assert.equal(sicToSector("71122"), "engineering");
    assert.equal(sicToSector("30300"), "engineering");
    assert.equal(sicToSector("86101"), "healthcare");
    assert.equal(sicToSector("21100"), "healthcare");
  });

  it("lets a longer prefix override its group", () => {
    assert.equal(sicToSector("71111"), "other"); // architecture, inside 711 engineering
    assert.equal(sicToSector("56101"), null); // restaurants: unmapped
    assert.equal(sicToSector("64209"), null); // holding company: neutral, not finance
  });
});

describe("parseSicText", () => {
  it("extracts the code", () => {
    assert.equal(parseSicText("62020 - Information technology consultancy activities"), "62020");
    assert.equal(parseSicText("None Supplied"), null);
    assert.equal(parseSicText(""), null);
  });
});

describe("sectorFromSicCodes", () => {
  it("uses the first in-scope code", () => {
    assert.equal(sectorFromSicCodes(["70229", "62020"]), "tech");
    assert.equal(sectorFromSicCodes(["56101"]), "other");
    assert.equal(sectorFromSicCodes([]), null);
  });

  it("treats any care code as care, even alongside health codes", () => {
    assert.equal(sectorFromSicCodes(["86900", "87100"]), "other");
    assert.equal(sectorFromSicCodes(["88100"]), "other");
  });

  it("excludes recruitment agencies only when it's their main activity", () => {
    assert.equal(sectorFromSicCodes(["78109", "62020"]), "other");
    assert.equal(sectorFromSicCodes(["62020", "78109"]), "tech");
  });
});

describe("knownEmployerSector", () => {
  it("covers employers Companies House can't classify", () => {
    assert.equal(knownEmployerSector("Deloitte LLP"), "finance");
    assert.equal(knownEmployerSector("PricewaterhouseCoopers LLP"), "finance");
    assert.equal(knownEmployerSector("Google (UK) Limited"), "tech");
    assert.equal(knownEmployerSector("GSK Plc"), "healthcare");
    assert.equal(knownEmployerSector("AtkinsRealis UK Limited"), "engineering");
  });

  it("doesn't match lookalike names", () => {
    for (const name of ["Atkins Brickwork Limited", "GSK Bodyworks Accident Repair Limited", "Amazonico UK Limited", "Apple Pharmacy"]) {
      assert.equal(knownEmployerSector(name), null, name);
    }
  });
});

describe("isLikelyCareProvider", () => {
  it("flags care-sounding names with only generic health codes", () => {
    assert.equal(isLikelyCareProvider("Oaks Healthcare Ltd", ["86900"]), true);
    assert.equal(isLikelyCareProvider("Spire Healthcare Ltd", ["86101"]), false);
    assert.equal(isLikelyCareProvider("Siemens Healthcare Limited", ["32500"]), false);
    assert.equal(isLikelyCareProvider("Bright Physio Ltd", ["86900"]), false);
    assert.equal(isLikelyCareProvider("Ascend Support (South) Limited", ["86900"]), true);
    assert.equal(isLikelyCareProvider("Healthcare Homes (LSC) Ltd", ["86102", "86900"]), true);
  });
});

describe("isNhsBody", () => {
  it("recognises NHS bodies across the four nations", () => {
    for (const name of [
      "Airedale NHS Foundation Trust",
      "NHS Lothian",
      "Betsi Cadwaladr University Health Board",
      "Belfast Health and Social Care Trust",
      "NHS Greater Manchester Integrated Care Board",
    ]) {
      assert.equal(isNhsBody(name), true, name);
    }
    assert.equal(isNhsBody("Snhs Consulting Ltd"), false);
  });
});

describe("sectorFromName", () => {
  it("guesses from clear keywords but never from care words", () => {
    assert.equal(sectorFromName("Dr Patel and Partners Medical Practice"), "healthcare");
    assert.equal(sectorFromName("Acme Software LLP"), "tech");
    assert.equal(sectorFromName("Smith & Co Accountants"), "finance");
    assert.equal(sectorFromName("Bright Healthcare Ltd"), null);
    assert.equal(sectorFromName("Sunrise Care Clinic"), null);
    assert.equal(sectorFromName("Joe's Kitchen"), null);
  });
});

describe("sizeBandFromAccounts", () => {
  it("orders accounts categories by size", () => {
    assert.equal(sizeBandFromAccounts("GROUP"), 3);
    assert.equal(sizeBandFromAccounts("MEDIUM"), 2);
    assert.equal(sizeBandFromAccounts("TOTAL EXEMPTION FULL"), 1);
    assert.equal(sizeBandFromAccounts("MICRO ENTITY"), 0);
    assert.equal(sizeBandFromAccounts("NO ACCOUNTS FILED"), 0);
  });
});

const company = (over: Partial<ChCompany>): ChCompany => ({
  name: "ACME LIMITED",
  number: "00000001",
  postTown: "LONDON",
  status: "Active",
  sizeBand: 1,
  sicCodes: ["62020"],
  ...over,
});

describe("chooseMatch", () => {
  it("accepts a single candidate, more confidently in the same town", () => {
    assert.equal(chooseMatch("London", [company({})])?.confidence, 0.95);
    assert.equal(chooseMatch("Leeds", [company({})])?.confidence, 0.8);
  });

  it("prefers active companies over dissolved-in-progress ones", () => {
    const m = chooseMatch("Leeds", [company({ number: "1", status: "Liquidation" }), company({ number: "2" })]);
    assert.equal(m?.company.number, "2");
  });

  it("uses the town to break ties", () => {
    const m = chooseMatch("Leeds", [company({ number: "1" }), company({ number: "2", postTown: "LEEDS" })]);
    assert.deepEqual([m?.company.number, m?.confidence], ["2", 0.85]);
  });

  it("refuses an ambiguous match across sectors, accepts one within a sector", () => {
    const tech = company({ number: "1", postTown: "BATH" });
    const finance = company({ number: "2", postTown: "YORK", sicCodes: ["64191"] });
    assert.equal(chooseMatch("Leeds", [tech, finance]), null);
    const bigTech = company({ number: "3", postTown: "YORK", sizeBand: 3 });
    assert.deepEqual(
      [chooseMatch("Leeds", [tech, bigTech])?.company.number, chooseMatch("Leeds", [tech, bigTech])?.confidence],
      ["3", 0.5],
    );
  });
});

describe("tagSponsor", () => {
  const sponsor = { id: 1, name: "Acme Ltd", isSkilledWorker: true, workerRating: "A" };

  it("puts NHS bodies in healthcare regardless of Companies House", () => {
    const t = tagSponsor({ ...sponsor, name: "Leeds Teaching Hospitals NHS Trust" }, null);
    assert.deepEqual([t.sector, t.sectorSource, t.inScope, t.sizeBand], ["healthcare", "nhs_name", true, 3]);
  });

  it("uses SIC codes from the match", () => {
    const t = tagSponsor(sponsor, { company: company({ sizeBand: 3 }), confidence: 0.95 });
    assert.deepEqual([t.sector, t.sectorSource, t.inScope, t.companyNumber], ["tech", "sic", true, "00000001"]);
    assert.equal(t.priorityScore, 3 * 2 + 1 + 0.95 * 2);
  });

  it("is never in scope off the Skilled Worker route", () => {
    const t = tagSponsor({ ...sponsor, isSkilledWorker: false }, { company: company({}), confidence: 0.95 });
    assert.deepEqual([t.inScope, t.priorityScore], [false, 0]);
  });

  it("reclassifies care agencies hiding under 86900", () => {
    const t = tagSponsor({ ...sponsor, name: "Oaks Healthcare Ltd" }, { company: company({ sicCodes: ["86900"] }), confidence: 0.95 });
    assert.deepEqual([t.sector, t.inScope], ["other", false]);
  });

  it("prefers the known-employers list over generic SIC codes", () => {
    const t = tagSponsor({ ...sponsor, name: "GSK Plc" }, { company: company({ sicCodes: ["70100"] }), confidence: 0.95 });
    assert.deepEqual([t.sector, t.sectorSource, t.inScope], ["healthcare", "known_employer", true]);
  });

  it("falls back to name keywords with low confidence", () => {
    const t = tagSponsor({ ...sponsor, name: "Acme Software LLP" }, null);
    assert.deepEqual([t.sector, t.sectorSource, t.matchConfidence], ["tech", "name_keyword", 0.3]);
  });
});
