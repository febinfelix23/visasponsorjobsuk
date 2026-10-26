import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUBJECTS, subjectName } from "./subjects";
import { entryId, parseEducation, parseExperience, parsePreferences } from "./validate";

const form = (fields: Record<string, string>) => new Map(Object.entries(fields)) as unknown as FormData;
const now = new Date("2026-10-26T12:00:00Z");

describe("subjects", () => {
  it("has all 167 CAH level 3 subjects", () => {
    assert.equal(SUBJECTS.length, 167);
    assert.equal(subjectName("CAH11-01-01"), "Computer science");
  });
});

describe("entryId", () => {
  it("reads a positive whole ID, or null when adding", () => {
    assert.equal(entryId(form({ id: "42" })), 42);
    for (const bad of ["", "0", "-3", "1.5", "abc"]) assert.equal(entryId(form({ id: bad })), null, bad);
  });
});

describe("parseEducation", () => {
  const ok = { level: "masters", subject: "CAH11-01-01", graduationYear: "2026" };

  it("accepts a degree, with a second subject once", () => {
    const r = parseEducation(form({ ...ok, subject2: "CAH15-02-01", university: " UCL " }), now);
    assert.deepEqual(r, { ok: true, value: { level: "masters", subjects: ["CAH11-01-01", "CAH15-02-01"], university: "UCL", graduationYear: 2026 } });
    const same = parseEducation(form({ ...ok, subject2: "CAH11-01-01" }), now);
    assert.ok(same.ok && same.value.subjects.length === 1);
  });

  it("refuses a level, subject or year that isn't on the lists", () => {
    const r = parseEducation(form({ level: "wizard", subject: "Computer Science", graduationYear: "1900" }), now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["graduationYear", "level", "subject"]);
  });

  it("drops an unknown second subject instead of storing it", () => {
    const r = parseEducation(form({ ...ok, subject2: "CAH99-99-99" }), now);
    assert.ok(r.ok && r.value.subjects.join() === "CAH11-01-01");
  });
});

describe("parseExperience", () => {
  it("reads a current job", () => {
    const r = parseExperience(form({ title: "DevOps Engineer", employer: "Acme", kind: "job", start: "2024-09", current: "on", end: "2025-01" }));
    assert.deepEqual(r, { ok: true, value: { title: "DevOps Engineer", employer: "Acme", kind: "job", startedOn: "2024-09-01", endedOn: null } });
  });

  it("reads a placement year with an end", () => {
    const r = parseExperience(form({ title: "Engineering placement", kind: "placement", start: "2023-07", end: "2024-06" }));
    assert.ok(r.ok && r.value.kind === "placement" && r.value.endedOn === "2024-06-01" && r.value.employer === null);
  });

  it("needs an end month unless it's the current job", () => {
    const r = parseExperience(form({ title: "Analyst", start: "2024-01" }));
    assert.ok(!r.ok && r.errors.end);
  });

  it("needs a title, sane dates, and falls back to job for an unknown type", () => {
    const bad = parseExperience(form({ start: "2025-05", end: "2024-01" }));
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["end", "title"]);
    const kind = parseExperience(form({ title: "Analyst", kind: "astronaut" }));
    assert.ok(kind.ok && kind.value.kind === "job");
  });
});

describe("parsePreferences", () => {
  it("reads visa details and locations", () => {
    const r = parsePreferences(form({ visaType: "graduate", visaExpiry: "2028-01-31", locations: " London, Manchester ,London,", remoteOk: "on" }));
    assert.deepEqual(r, { ok: true, value: { visaType: "graduate", visaExpiry: "2028-01-31", locations: ["London", "Manchester"], remoteOk: true } });
  });

  it("drops an expiry without a visa type, and an unknown visa type", () => {
    const r = parsePreferences(form({ visaType: "tourist", visaExpiry: "2028-01-31" }));
    assert.deepEqual(r, { ok: true, value: { visaType: null, visaExpiry: null, locations: [], remoteOk: false } });
  });
});
