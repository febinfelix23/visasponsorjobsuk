import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advertStatus, elementById, parseAdvert, parseSearchXml } from "./adapters/nhs-jobs";
import { approximatePostedOn, ukFacetFilter } from "./adapters/workday";
import { greenhouseJobIsUk } from "./adapters/greenhouse";
import { DETAIL_VERSION, dueBefore, jobSlug, knownForDetail, RECRAWL_HOURS, settleMissing, uniqueJobs } from "./pipeline";
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

describe("Greenhouse UK filter", () => {
  const job = (location: string, offices: string[]) => ({ location: { name: location }, offices: offices.map((name) => ({ name })) });

  it("drops a job based abroad even when one of its offices has a UK town's name (Verkada, Melbourne)", () => {
    assert.equal(greenhouseJobIsUk(job("Melbourne, Australia", ["Melbourne"])), false);
    assert.equal(greenhouseJobIsUk(job("Zurich, Switzerland", ["London", "Zurich"])), false);
  });

  it("keeps UK jobs, and uses the offices when the job's own location is unclear", () => {
    assert.equal(greenhouseJobIsUk(job("London", [])), true);
    assert.equal(greenhouseJobIsUk(job("Dublin, Ireland; London", ["Dublin", "London"])), true);
    assert.equal(greenhouseJobIsUk(job("Remote", ["London"])), true);
    assert.equal(greenhouseJobIsUk(job("Remote", ["New York"])), false);
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
    const advert = parseAdvert(html);
    assert.equal(advert.town, "Leeds");
    assert.match(advert.description, /Certificate of Sponsorship\nApplications from job seekers/);
  });

  // Invented text in the live page's structure (Oct 2026): headed sections, the working
  // pattern in an unlabelled paragraph, and the details block repeated for mobile.
  const LIVE_LAYOUT = `<html><body><div id="cookie-banner"><h2>Cookies on NHS Jobs</h2><p>We use cookies.</p></div>
    <main id="maincontent"><div id="main-body">
      <h2>Job summary</h2><p id="job_overview">Join our physiotherapy team.</p>
      <h3>Main duties of the job</h3><p id="job_description">Assess patients.</p>
      <h3>About us</h3><p id="about_organisation">We are unable to offer sponsorship for this post.</p>
      <h2>Details</h2>
      <h3>Band</h3><p id="payscheme-band">Band 6</p>
      <h3 id="contract_type_heading">Contract</h3><p id="contract_type">Permanent</p>
      <h3 id="working_pattern_heading">Working pattern</h3><p> Part-time </p>
      <h2>Job description</h2><h3>Job responsibilities</h3><div id="job_description_large"><p>Run clinics.</p></div>
      <h2>Person Specification</h2><h3 id="skill_category_2">Experience</h3><ul><li>Two years post-registration experience</li></ul>
      <h3 id="tier-two-sponsorship">Certificate of Sponsorship</h3><p>Applications from job seekers who require current Skilled worker sponsorship to work in the UK are welcome.</p>
      <h2>Details</h2>
      <h3>Band</h3><p>Band 6</p>
      <h3 id="working_pattern_heading">Working pattern</h3><p> Part-time </p>
      <h3>Employer contact details</h3><h3>For questions about the job, contact:</h3><p>Jane Example, jane@example.nhs.uk</p>
      <h3 id="supporting_documents_heading">Supporting documents</h3><p>Job description.pdf</p>
    </div></main></body></html>`;

  it("keeps the whole advert, section by section, once", () => {
    const { description } = parseAdvert(LIVE_LAYOUT);
    for (const part of ["Job summary\nJoin our physiotherapy team.", "About us\nWe are unable to offer sponsorship", "Job responsibilities\nRun clinics.", "Experience\n• Two years post-registration experience", "Certificate of Sponsorship\nApplications from job seekers"]) {
      assert.ok(description.includes(part), `missing: ${part}`);
    }
    // The mobile copy of the details block isn't repeated.
    assert.equal(description.match(/Working pattern/g)?.length, 1);
  });

  it("reads the working pattern, which has no id of its own", () => {
    assert.equal(parseAdvert(LIVE_LAYOUT).workingPattern, "Part-time");
  });

  it("leaves out contact names, cookies and attachments", () => {
    const { description } = parseAdvert(LIVE_LAYOUT);
    assert.doesNotMatch(description, /Jane Example|jane@example|cookies|\.pdf/i);
  });
});

describe("detail versions", () => {
  it("counts a stored job as known only when its details came from the current parser", () => {
    const stored = [
      { externalId: "A", detailVersion: DETAIL_VERSION.nhs_jobs },
      { externalId: "B", detailVersion: DETAIL_VERSION.nhs_jobs - 1 },
    ];
    assert.deepEqual([...knownForDetail(stored, "nhs_jobs")], ["A"]);
  });

  it("re-fetches details once after the whole-advert NHS parser and the 20,000-character cap", () => {
    for (const ats of ["nhs_jobs", "workday", "smartrecruiters"] as const) assert.ok(DETAIL_VERSION[ats] >= 2, ats);
  });
});

describe("crawl scheduling", () => {
  const at = (iso: string) => new Date(iso);
  const hours = (h: number) => h * 3_600_000;

  it("crawls a source due shortly after the run starts (NHS skipped on 27 Oct 2026)", () => {
    // Crawled 26 Oct 22:10; the next run started 27 Oct 21:32, 38 minutes before NHS fell due.
    const nextCrawl = new Date(at("2026-10-26T22:10:44Z").getTime() + hours(RECRAWL_HOURS));
    assert.ok(nextCrawl <= dueBefore(at("2026-10-27T21:32:12Z")));
  });

  it("keeps every source on twice-daily runs that start hours early or late", () => {
    const crawled = at("2026-10-27T11:10:26Z");
    const nextCrawl = new Date(crawled.getTime() + hours(RECRAWL_HOURS));
    // GitHub's 06:00/18:00 runs drifted to 11:10 and 21:32: about 10 hours apart.
    assert.ok(nextCrawl <= dueBefore(new Date(crawled.getTime() + hours(10))));
  });
});

describe("missing NHS adverts", () => {
  const page = (closing: string, button: string) =>
    `<main><h1>Staff Nurse</h1><p id="closing_date" class="closing-date"><strong>${closing}</strong></p>${button}<h2>Job summary</h2></main>`;

  it("reads a closed advert as closed", () => {
    assert.equal(advertStatus(200, page("This job is now closed", "")), "closed");
    assert.equal(advertStatus(404, ""), "closed");
    assert.equal(advertStatus(410, ""), "closed");
  });

  it("reads an advert with an Apply button as open, whichever kind of button (A0087 regression)", () => {
    assert.equal(advertStatus(200, page("The closing date is 13 November 2026", `<a id="apply" class="nhsuk-button" href="/candidate/application/X">Apply for this job</a>`)), "open");
    assert.equal(advertStatus(200, page("The closing date is 02 November 2026", `<a id="apply-ats-direct" class="nhsuk-button" href="/x">Apply for this job</a>`)), "open");
  });

  it("doesn't guess when the page is unclear or unreachable", () => {
    assert.equal(advertStatus(200, page("The closing date is 13 November 2026", "")), "unknown");
    assert.equal(advertStatus(503, ""), "unknown");
    assert.equal(advertStatus(429, ""), "unknown");
  });

  it("expires closed jobs now, keeps open ones, and counts the rest as a normal miss", () => {
    const statuses = new Map([["A", "closed"], ["B", "open"], ["C", "unknown"]] as const);
    assert.deepEqual(settleMissing(["A", "B", "C", "D"], statuses), { expire: ["A"], keep: ["B"], count: ["C", "D"] });
  });
});

describe("uniqueJobs", () => {
  const job = (externalId: string, title: string, description?: string) => emptyJob({ externalId, title, applyUrl: "x", description });

  it("keeps one copy of a job a listing names twice", () => {
    // Accenture's Workday listing, 25 Oct 2026: the same posting on two pages broke the upsert.
    const out = uniqueJobs([job("R1", "Analyst"), job("R2", "Engineer"), job("R1", "Analyst")]);
    assert.deepEqual(out.map((j) => j.externalId), ["R1", "R2"]);
  });

  it("prefers the copy with a description", () => {
    const out = uniqueJobs([job("R1", "Analyst"), job("R1", "Analyst", "Full advert text")]);
    assert.equal(out.length, 1);
    assert.equal(out[0].description, "Full advert text");
  });

  it("leaves distinct jobs alone", () => {
    assert.equal(uniqueJobs([job("A", "x"), job("B", "x"), job("C", "x")]).length, 3);
  });
});
