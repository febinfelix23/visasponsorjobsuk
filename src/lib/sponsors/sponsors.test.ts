import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffRegister, type ExistingSponsor } from "./diff";
import { normaliseOrgName, registerKey, splitTradingName } from "./normalise";
import { groupSponsors, parseRegisterCsv, parseTypeAndRating } from "./register";
import { CsvParser, parseCsv } from "@/lib/csv";

describe("normaliseOrgName", () => {
  it("drops legal suffixes, punctuation and case", () => {
    assert.equal(normaliseOrgName("MONZO BANK LIMITED"), "monzo bank");
    assert.equal(normaliseOrgName("Monzo Bank Ltd."), "monzo bank");
    assert.equal(normaliseOrgName("The Bank of London plc"), "bank of london");
    assert.equal(normaliseOrgName("Smith & Sons (UK) Ltd"), "smith and sons uk");
    assert.equal(normaliseOrgName("Café Nero"), "cafe nero");
  });

  it("keeps a name that is only a suffix word", () => {
    assert.equal(normaliseOrgName("Limited"), "limited");
  });
});

describe("splitTradingName", () => {
  it("splits t/a and trading as", () => {
    assert.deepEqual(splitTradingName("Acme Holdings Ltd t/a Acme Health"), {
      legalName: "Acme Holdings Ltd",
      tradingName: "Acme Health",
    });
    assert.deepEqual(splitTradingName("Foo Ltd Trading As Bar"), { legalName: "Foo Ltd", tradingName: "Bar" });
    assert.deepEqual(splitTradingName("Plain Ltd"), { legalName: "Plain Ltd", tradingName: null });
  });
});

describe("registerKey", () => {
  it("ignores case and stray whitespace", () => {
    assert.equal(registerKey(" Asian African Foods Ltd ", " London  "), registerKey("asian african foods ltd", "LONDON"));
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\nlast,\n');
    assert.deepEqual(rows, [
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["last", ""],
    ]);
  });

  it("gives the same rows however the input is chunked", () => {
    const text = '﻿a,"b ""q"", c"\r\n"multi\nline",x\r\nend,""\n';
    const expected = parseCsv(text);
    for (let size = 1; size <= text.length; size++) {
      const rows: string[][] = [];
      const parser = new CsvParser((r) => rows.push(r));
      for (let i = 0; i < text.length; i += size) parser.push(text.slice(i, i + size));
      parser.end();
      assert.deepEqual(rows, expected, `chunk size ${size}`);
    }
    assert.deepEqual(expected, [
      ["a", 'b "q", c'],
      ["multi\nline", "x"],
      ["end", ""],
    ]);
  });
});

describe("parseTypeAndRating", () => {
  it("parses every rating format on the register", () => {
    assert.deepEqual(parseTypeAndRating("Worker (A rating)"), { type: "Worker", rating: "A" });
    assert.deepEqual(parseTypeAndRating("Temporary Worker (B rating)"), { type: "Temporary Worker", rating: "B" });
    assert.deepEqual(parseTypeAndRating("Worker (A (Premium))"), { type: "Worker", rating: "A (Premium)" });
    assert.deepEqual(parseTypeAndRating("Worker (UK Expansion Worker: Provisional )"), {
      type: "Worker",
      rating: "UK Expansion Worker: Provisional",
    });
  });
});

const csv = [
  "Organisation Name,Town/City,County,Type & Rating,Route",
  " Acme Ltd ,London,,Worker (A rating),Skilled Worker",
  "Acme Ltd,london,Greater London,Worker (A rating),Global Business Mobility: Senior or Specialist Worker",
  "Acme Ltd,London,,Temporary Worker (A rating),Creative Worker",
  "Beta NHS Foundation Trust,Leeds,West Yorkshire,Worker (A rating),Skilled Worker",
  "Gamma Church,York,,Worker (A rating),Religious Worker",
].join("\n");

describe("groupSponsors", () => {
  it("merges one row per route into one sponsor", () => {
    const sponsors = groupSponsors(parseRegisterCsv(csv));
    assert.equal(sponsors.size, 3);
    const acme = sponsors.get(registerKey("Acme Ltd", "London"))!;
    assert.equal(acme.county, "Greater London");
    assert.equal(acme.workerRating, "A");
    assert.equal(acme.temporaryWorkerRating, "A");
    assert.equal(acme.isSkilledWorker, true);
    assert.deepEqual(acme.routes, [
      "Creative Worker",
      "Global Business Mobility: Senior or Specialist Worker",
      "Skilled Worker",
    ]);
    assert.equal(sponsors.get(registerKey("Gamma Church", "York"))!.isSkilledWorker, false);
  });

  it("rejects a file with an unexpected header", () => {
    assert.throws(() => parseRegisterCsv("Name,Town\nA,B"), /Unexpected register header/);
  });
});

describe("diffRegister", () => {
  const incoming = groupSponsors(parseRegisterCsv(csv));
  const acme = incoming.get(registerKey("Acme Ltd", "London"))!;
  const beta = incoming.get(registerKey("Beta NHS Foundation Trust", "Leeds"))!;
  const existing = (over: Partial<ExistingSponsor> & { registerKey: string }): ExistingSponsor => ({
    id: 1,
    status: "active",
    name: "",
    county: null,
    workerRating: "A",
    temporaryWorkerRating: null,
    routes: [],
    ...over,
  });

  it("detects added, removed, re-added, rating and route changes", () => {
    const diff = diffRegister(
      [
        existing({ id: 1, ...acme, workerRating: "B", routes: ["Skilled Worker"] }),
        existing({ id: 2, ...beta, status: "removed" }),
        existing({ id: 3, registerKey: "gone ltd|bath", name: "Gone Ltd" }),
      ],
      incoming,
    );
    const types = diff.events.map((e) => `${e.type}:${e.registerKey}`).sort();
    assert.deepEqual(types, [
      `added:${registerKey("Gamma Church", "York")}`,
      `rating_changed:${acme.registerKey}`,
      `readded:${beta.registerKey}`,
      "removed:gone ltd|bath",
      `routes_changed:${acme.registerKey}`,
    ]);
    assert.equal(diff.upserts.length, 3);
    assert.deepEqual(diff.removed.map((s) => s.id), [3]);
    assert.equal(diff.addedCount, 2);
    assert.equal(diff.changedCount, 1);
  });

  it("writes nothing when the register is unchanged", () => {
    const diff = diffRegister(
      [...incoming.values()].map((r, i) => existing({ id: i, ...r })),
      incoming,
    );
    assert.equal(diff.upserts.length, 0);
    assert.equal(diff.events.length, 0);
  });
});
