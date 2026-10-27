import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JobListItem } from "@/lib/site/queries";
import {
  groupByField,
  instagramCaption,
  jobLink,
  pickTop,
  POST_SIZE,
  redditRoundup,
  selectForPost,
  spreadAcrossFields,
  TELEGRAM_LIMIT,
  telegramPost,
  whatsappDigest,
} from "./posts";

let n = 0;
const job = (over: Partial<JobListItem>): JobListItem => ({
  id: ++n,
  slug: `job-${n}`,
  title: `Graduate Analyst ${n}`,
  employerName: `Employer ${n}`,
  locationText: "London",
  field: "software",
  sector: "tech",
  salaryAnnualMin: 42000,
  salaryAnnualMax: null,
  sponsorability: "likely_eligible",
  seniority: "graduate",
  isGradScheme: false,
  closingDate: null,
  firstSeenAt: "2026-10-24T06:00:00.000Z",
  isNew: false,
  ...over,
});

const opts = { siteUrl: "https://example.test", date: new Date("2026-10-24T09:00:00Z") };

describe("jobLink", () => {
  it("is the job's short link, with no tracking tags", () => {
    assert.equal(jobLink("https://example.test", { id: 15992 }), "https://example.test/j/cc8");
  });
});

describe("pickTop", () => {
  it("groups by field in registry order, skipping Other, and keeps the ranking", () => {
    const ranked = [job({ field: "data", title: "D1" }), job({ field: "software", title: "S1" }), job({ field: "other" }), job({ field: "software", title: "S2" })];
    const groups = pickTop(ranked, 3);
    assert.deepEqual(groups.map((g) => g.field), ["software", "data"]);
    assert.deepEqual(groups[0].jobs.map((j) => j.title), ["S1", "S2"]);
    assert.equal(groups[0].label, "Software & IT");
  });

  it("takes at most one job per employer and per title in a field", () => {
    const ranked = [
      job({ employerName: "Monzo", title: "Backend Engineer" }),
      job({ employerName: "monzo", title: "Frontend Engineer" }),
      job({ employerName: "Wise", title: "backend  engineer" }),
      job({ employerName: "Revolut", title: "iOS Engineer" }),
    ];
    assert.deepEqual(pickTop(ranked, 5)[0].jobs.map((j) => j.employerName), ["Monzo", "Revolut"]);
  });

  it("stops at the per-field limit", () => {
    const ranked = Array.from({ length: 6 }, () => job({}));
    assert.equal(pickTop(ranked, 2)[0].jobs.length, 2);
  });
});

describe("spreadAcrossFields", () => {
  it("takes each field's best job first, then second picks", () => {
    const groups = pickTop([job({ field: "software", title: "S1" }), job({ field: "software", title: "S2" }), job({ field: "data", title: "D1" })], 3);
    assert.deepEqual(spreadAcrossFields(groups, 9).map((j) => j.title), ["S1", "D1", "S2"]);
    assert.deepEqual(spreadAcrossFields(groups, 2).map((j) => j.title), ["S1", "D1"]);
  });
});

describe("selectForPost", () => {
  const pool = ["software", "data", "engineering", "finance"].flatMap((field) => Array.from({ length: 8 }, (_, i) => job({ field, title: `${field} ${i}` })));

  it("always gives each post its fixed number of jobs when the pool is big enough", () => {
    for (const size of Object.values(POST_SIZE)) assert.equal(selectForPost(pool, size).length, size);
  });

  it("fills from one field when that's all there is", () => {
    const oneField = Array.from({ length: 12 }, (_, i) => job({ field: "data", title: `data ${i}` }));
    assert.equal(selectForPost(oneField, 10).length, 10);
  });

  it("gives fewer only when the pool runs short", () => {
    assert.equal(selectForPost(pool.slice(0, 3), 10).length, 3);
  });

  it("spreads across fields before taking a second job from any", () => {
    assert.deepEqual(selectForPost(pool, 6).map((j) => j.title), ["software 0", "data 0", "engineering 0", "finance 0", "software 1", "data 1"]);
  });
});

describe("groupByField", () => {
  it("puts selected jobs back into field sections in registry order", () => {
    const groups = groupByField([job({ field: "data", title: "D" }), job({ field: "software", title: "S1" }), job({ field: "software", title: "S2" })]);
    assert.deepEqual(groups.map((g) => [g.field, g.jobs.map((j) => j.title)]), [["software", ["S1", "S2"]], ["data", ["D"]]]);
  });
});

describe("telegramPost", () => {
  it("lists each job with its facts and a tagged link", () => {
    const groups = pickTop([job({ title: "Graduate Software Engineer", employerName: "Monzo", salaryAnnualMin: 45000, isGradScheme: true })], 3);
    const post = telegramPost(groups, opts);
    assert.match(post, /^\*\*Graduate jobs at UK visa sponsors: 24 October\*\*/);
    assert.match(post, /\*\*Software & IT\*\*/);
    assert.match(post, /• Graduate Software Engineer\nMonzo, London\n£45,000 a year\. Graduate scheme\. Likely eligible\n/);
    assert.match(post, /\nhttps:\/\/example\.test\/j\/[0-9a-z]+\n/);
    assert.doesNotMatch(post, /utm_/);
    assert.match(post, /not immigration advice/);
  });

  it("drops the lowest-ranked jobs until the post fits Telegram's limit", () => {
    const ranked = ["software", "data", "engineering", "finance", "healthcare", "business"].flatMap((field) =>
      Array.from({ length: 5 }, (_, i) => job({ field, title: `${field} role ${i} with quite a long descriptive title for testing`, employerName: `${field} employer ${i}` })),
    );
    const groups = pickTop(ranked, 5);
    const post = telegramPost(groups, opts);
    assert.ok(post.length <= TELEGRAM_LIMIT, `post is ${post.length} characters`);
    // Every field keeps its best job; trimming takes from the bottom of the biggest sections.
    for (const field of ["software", "data", "engineering", "finance", "healthcare", "business"]) assert.match(post, new RegExp(`${field} role 0 `));
    assert.doesNotMatch(post, /business role 4 /);
  });
});

describe("whatsappDigest", () => {
  it("uses WhatsApp's bold and tags links for WhatsApp", () => {
    const post = whatsappDigest(pickTop([job({})], 3), opts);
    assert.match(post, /^\*Graduate jobs at UK visa sponsors: 24 October\*/);
    assert.match(post, /https:\/\/example\.test\/j\/[0-9a-z]+/);
    assert.doesNotMatch(post, /utm_/);
    assert.doesNotMatch(post, /\*\*/);
  });
});

describe("redditRoundup", () => {
  it("writes Markdown links and escapes Markdown in job text", () => {
    const { title, body } = redditRoundup(pickTop([job({ title: "C# Developer [Graduate]", employerName: "Acme_Co" })], 3), opts);
    assert.equal(title, "Graduate jobs at UK licensed visa sponsors, week of 24 October");
    assert.match(body, /## Software & IT/);
    assert.match(body, /- \[C# Developer \\\[Graduate\\\]\]\(https:\/\/example\.test\/j\/[0-9a-z]+\), Acme\\_Co, London\./);
  });
});

describe("instagramCaption", () => {
  it("numbers the carousel's jobs and points to the bio link", () => {
    const caption = instagramCaption([job({ title: "A", employerName: "X" }), job({ title: "B", employerName: "Y" })], opts);
    assert.match(caption, /1\. A, X\n2\. B, Y/);
    assert.match(caption, /Link in bio/);
    assert.doesNotMatch(caption, /https?:\/\//);
  });
});
