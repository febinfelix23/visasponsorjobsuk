import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { elementById, parseAdvert, parseSearchXml, sponsorshipSection } from "./adapters/nhs-jobs";
import { approximatePostedOn, ukFacetFilter } from "./adapters/workday";
import { jobSlug } from "./pipeline";
import { htmlToText, snippetOf } from "./text";
import { emptyJob } from "./types";
import { checkSponsorInJobs, mentionsSponsor, sponsorPhrases } from "./verify";

describe("htmlToText", () => {
  it("keeps paragraph breaks and decodes Greenhouse's double-escaped HTML", () => {
    assert.equal(htmlToText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;p&gt;Line two&lt;/p&gt;"), "Hello & welcome\nLine two");
    assert.equal(htmlToText("<ul><li>One</li><li>Two</li></ul>"), "• One\n• Two");
    assert.equal(htmlToText("£45,000&nbsp;per&#160;annum"), "£45,000 per annum");
  });
});

describe("snippetOf", () => {
  it("ends on a sentence when it can", () => {
    const text = "First sentence here. ".repeat(20);
    const snippet = snippetOf(text, 50)!;
    assert.ok(snippet.endsWith(".") && snippet.length <= 50);
  });
});

describe("jobSlug", () => {
  it("is readable, unique per source job and stable", () => {
    const a = jobSlug("Graduate Software Engineer (2027)", "Monzo", 7, "123");
    assert.match(a, /^graduate-software-engineer-2027-monzo-[0-9a-f]{6}$/);
    assert.equal(a, jobSlug("Graduate Software Engineer (2027)", "Monzo", 7, "123"));
    assert.notEqual(a, jobSlug("Graduate Software Engineer (2027)", "Monzo", 7, "124"));
  });
});

describe("mentionsSponsor", () => {
  const job = (description: string) => emptyJob({ externalId: "1", title: "Engineer", applyUrl: "x", description });

  it("finds the sponsor's full or distinctive name in job text", () => {
    assert.equal(mentionsSponsor([job("At Allica Bank we build business banking.")], ["Allica Bank", null]), true);
    assert.equal(mentionsSponsor([job("Join AccuRx, the NHS's favourite…"), job("AccuRx is hiring")], ["AccuRx Limited", null]), true);
  });

  it("ignores ordinary words that happen to be a company's core name", () => {
    // "access" is a one-word phrase, so it needs most of 2+ jobs, which one benefits line isn't.
    assert.equal(mentionsSponsor([job("You'll have access to great benefits.")], ["Access Capital Partners (UK) Ltd.", null]), false);
  });

  it("recognises how companies name themselves in ads (Wise, ElevenLabs), but not 3-letter names", () => {
    assert.ok(sponsorPhrases(["Wise Payments Limited"]).includes("wise"));
    assert.ok(sponsorPhrases(["Eleven Labs Ltd"]).includes("elevenlabs"));
    assert.ok(!sponsorPhrases(["MAP GROUP (UK) LIMITED"]).includes("map"));
    const wise = [job("Wise is a global technology company…"), job("At Wise, we move money and payments…"), job("Join Wise")];
    assert.equal(checkSponsorInJobs(wise, ["Wise Payments Limited", null]), "confirmed");
    const map = [job("MAP is a creative agency"), job("At MAP we design…")];
    assert.equal(checkSponsorInJobs(map, ["MAP GROUP (UK) LIMITED", null]), "rejected");
  });
});

describe("checkSponsorInJobs", () => {
  const job = (description: string) => emptyJob({ externalId: "1", title: "Engineer", applyUrl: "x", description });

  it("needs more than one job to trust a one-word name (Academia.edu vs Academia Ltd)", () => {
    assert.equal(checkSponsorInJobs([job("Academia is the platform for academics.")], ["Academia Limited", null]), "insufficient");
    const accurx = [job("At AccuRx we build…"), job("AccuRx is hiring"), job("Join AccuRx")];
    assert.equal(checkSponsorInJobs(accurx, ["AccuRx Limited", null]), "confirmed");
  });

  it("judges a one-word match as one-word even when the full name is longer", () => {
    assert.equal(checkSponsorInJobs([job("Academia is the platform for academics.")], ["Academia Holdings Ltd", null]), "insufficient");
  });

  it("tells Spire Global from Spire Healthcare by clinical job titles", () => {
    const titled = (title: string, d: string) => emptyJob({ externalId: title, title, applyUrl: "x", description: d });
    const global = [titled("Satellite Operations Engineer", "Spire builds satellites. Private health insurance."), titled("Software Engineer", "At Spire we… healthcare benefits")];
    assert.equal(checkSponsorInJobs(global, ["Spire Healthcare Ltd", null], "healthcare"), "rejected");
    const hospital = [titled("Theatre Practitioner", "Spire Bristol Hospital"), titled("Staff Nurse", "Join Spire")];
    assert.equal(checkSponsorInJobs(hospital, ["Spire Healthcare Ltd", null], "healthcare"), "confirmed");
  });

  it("sends namesakes it can't tell apart to review instead of going live", () => {
    // Axiom the legal-services firm vs Axiom Manufacturing Services: "services" proves nothing,
    // and "manufacturing" never appears, so it's rejected outright.
    const axiom = [job("About Axiom: the leading alternative legal services provider"), job("Axiom gives in-house legal teams…")];
    assert.equal(checkSponsorInJobs(axiom, ["Axiom Manufacturing Services Limited", null], "engineering"), "rejected");
    const calibre = [job("About Calibre: AI systems security"), job("At Calibre we…")];
    assert.equal(checkSponsorInJobs(calibre, ["Calibre Global Limited", null], "tech"), "needs_review");
  });

  it("rejects a board whose jobs never name the sponsor", () => {
    assert.equal(checkSponsorInJobs([job("We are Alpha Labs, a US startup."), job("Alpha Labs")], ["Alpha Bank London Ltd", null]), "rejected");
  });
});

describe("Workday", () => {
  it("prefers the country facet, else the tenant's UK office locations", () => {
    const uk = "29247e57dbaf46fb855b224e03170bc7";
    assert.deepEqual(ukFacetFilter([{ facetParameter: "Country", values: [{ id: uk, descriptor: "United Kingdom" }] }]), { Country: [uk] });
    assert.deepEqual(
      ukFacetFilter([
        {
          facetParameter: "locationMainGroup",
          values: [
            {
              facetParameter: "locations",
              values: [
                { id: "a", descriptor: "Northampton, Barclays Campus" },
                { id: "b", descriptor: "New York, 745 7th Avenue" },
                { id: "c", descriptor: "Glasgow, Tech Centre" },
              ],
            },
          ],
        },
      ]),
      { locations: ["a", "c"] },
    );
    assert.equal(ukFacetFilter([{ facetParameter: "timeType", values: [{ id: "x", descriptor: "Full time" }] }]), null);
  });

  it("turns 'Posted 3 Days Ago' into a date", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    assert.equal(approximatePostedOn("Posted 3 Days Ago", now)?.toISOString(), "2026-10-19T12:00:00.000Z");
    assert.equal(approximatePostedOn("Posted 30+ Days Ago", now)?.toISOString(), "2026-09-22T12:00:00.000Z");
    assert.equal(approximatePostedOn("Posted Today", now), now);
  });
});

describe("NHS Jobs", () => {
  it("parses the search XML", () => {
    const xml = `<nhsJobs><vacancyDetails><id>1</id><reference>C9152-26-1076</reference><title>Staff Nurse &amp; Midwife</title><employer>Leeds Teaching Hospitals NHS Trust</employer><type>Permanent</type><salary>£31,049</salary><closeDate>2026-11-06</closeDate><postDate>2026-10-16T10:28:18</postDate><url>https://beta.jobs.nhs.uk/x</url></vacancyDetails><totalPages>12</totalPages><totalResults>115</totalResults></nhsJobs>`;
    const { vacancies, totalPages } = parseSearchXml(xml);
    assert.equal(totalPages, 12);
    assert.deepEqual([vacancies[0].reference, vacancies[0].title, vacancies[0].closeDate], ["C9152-26-1076", "Staff Nurse & Midwife", "2026-11-06"]);
  });

  it("extracts nested elements and the sponsorship section from an advert", () => {
    const html = `<div id="job_description_large"><div><p>Main duties</p></div><p>More</p></div><p id="employer_town">Leeds</p>
      <h3 id="tier-two-sponsorship" class="x">Certificate of Sponsorship</h3><p>Applications from job seekers who require current Skilled worker sponsorship to work in the UK are welcome.</p><h3>Next</h3>`;
    assert.equal(htmlToText(elementById(html, "job_description_large")), "Main duties\n\nMore");
    assert.match(sponsorshipSection(html)!, /require current Skilled worker sponsorship/);
    const advert = parseAdvert(html);
    assert.equal(advert.town, "Leeds");
    assert.match(advert.description, /Certificate of Sponsorship\nApplications from job seekers/);
  });
});
