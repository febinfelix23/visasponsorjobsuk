import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobPostingJsonLd, jsonLdScript, schemaEmploymentType, type JobForSchema } from "./structured-data";

const job = (over: Partial<JobForSchema> = {}): JobForSchema => ({
  slug: "graduate-data-scientist-wise-1",
  title: "Graduate Data Scientist",
  employerName: "Wise Payments Limited",
  locationText: "London",
  isRemote: false,
  snippet: "Join our data team.",
  employmentType: "Full-time",
  salaryAnnualMin: 58000,
  salaryAnnualMax: null,
  postedAt: "2026-10-20T09:00:00.000Z",
  firstSeenAt: "2026-10-21T06:00:00.000Z",
  closingDate: "2026-11-30",
  ...over,
});

describe("jobPostingJsonLd", () => {
  it("has the fields Google requires for a job posting", () => {
    const d = jobPostingJsonLd(job());
    assert.equal(d["@type"], "JobPosting");
    assert.equal(d.title, "Graduate Data Scientist");
    assert.match(String(d.description), /^Join our data team\./);
    assert.equal(d.datePosted, "2026-10-20T09:00:00.000Z");
    assert.deepEqual(d.hiringOrganization, { "@type": "Organization", name: "Wise Payments Limited" });
    assert.deepEqual(d.jobLocation, { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "London", addressCountry: "GB" } });
    assert.equal(d.validThrough, "2026-11-30T23:59:59+00:00");
    assert.equal(d.directApply, false);
    assert.match(String(d.url), /\/jobs\/graduate-data-scientist-wise-1$/);
  });

  it("gives a single salary as a value and a range as min and max", () => {
    assert.deepEqual((jobPostingJsonLd(job()).baseSalary as { value: unknown }).value, { "@type": "QuantitativeValue", unitText: "YEAR", value: 58000 });
    assert.deepEqual((jobPostingJsonLd(job({ salaryAnnualMin: 45000, salaryAnnualMax: 55000 })).baseSalary as { value: unknown }).value, {
      "@type": "QuantitativeValue",
      unitText: "YEAR",
      minValue: 45000,
      maxValue: 55000,
    });
    assert.equal(jobPostingJsonLd(job({ salaryAnnualMin: null })).baseSalary, undefined);
  });

  it("leaves out what isn't known rather than guessing", () => {
    const d = jobPostingJsonLd(job({ closingDate: null, employmentType: null, postedAt: null, locationText: null }));
    assert.equal(d.validThrough, undefined);
    assert.equal(d.employmentType, undefined);
    assert.equal(d.datePosted, "2026-10-21T06:00:00.000Z");
    assert.deepEqual(d.jobLocation, { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "GB" } });
  });

  it("marks remote jobs as UK-wide telecommuting", () => {
    const d = jobPostingJsonLd(job({ isRemote: true }));
    assert.equal(d.jobLocationType, "TELECOMMUTE");
    assert.deepEqual(d.applicantLocationRequirements, { "@type": "Country", name: "United Kingdom" });
  });
});

describe("schemaEmploymentType", () => {
  it("maps ATS labels to Google's values", () => {
    assert.deepEqual(schemaEmploymentType("FullTime"), ["FULL_TIME"]);
    // Permanent says nothing about hours.
    assert.equal(schemaEmploymentType("Permanent - Employee"), undefined);
    assert.deepEqual(schemaEmploymentType("Part-time"), ["PART_TIME"]);
    assert.deepEqual(schemaEmploymentType("Fixed Term (12 months)"), ["TEMPORARY"]);
    assert.deepEqual(schemaEmploymentType("Internship"), ["INTERN"]);
    assert.equal(schemaEmploymentType("Hybrid"), undefined);
    assert.equal(schemaEmploymentType(null), undefined);
  });
});

describe("jsonLdScript", () => {
  it("can't be broken out of by text in a job ad", () => {
    const out = jsonLdScript({ title: "</script><script>alert(1)</script>" });
    assert.doesNotMatch(out, /<\/script>/i);
    assert.deepEqual(JSON.parse(out), { title: "</script><script>alert(1)</script>" });
  });
});
