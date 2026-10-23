import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverSponsor, judgeHit, type ProbeFn } from "./discover";
import { HostBlockedError } from "@/lib/http";
import type { BoardHit, ProbeAts } from "./probes";
import { coreName, isDistinctiveSlug, namesMatch, slugCandidates } from "./slugs";

describe("slugCandidates", () => {
  it("tries the full name before its distinctive core", () => {
    assert.deepEqual(
      slugCandidates("Monzo Bank Ltd", null).map((c) => `${c.kind}:${c.slug}`),
      ["full:monzobank", "full:monzo-bank", "core:monzo"],
    );
  });

  it("puts the trading name first and drops UK", () => {
    const slugs = slugCandidates("Acme Holdings (UK) Ltd t/a Brightwave", "Brightwave").map((c) => c.slug);
    assert.equal(slugs[0], "brightwave");
    assert.ok(!slugs.some((s) => s.includes("uk")));
  });

  it("skips slugs that are too short", () => {
    assert.ok(slugCandidates("AB Ltd", null).every((c) => c.slug.length >= 3));
  });
});

describe("namesMatch", () => {
  it("compares the distinctive part of names", () => {
    assert.equal(coreName("Monzo Bank Ltd"), "monzo");
    assert.equal(namesMatch("Monzo", ["Monzo Bank Ltd", null]), true);
    assert.equal(namesMatch("Kraken", ["Kraken Technologies Limited", null]), true);
    assert.equal(namesMatch("Apple", ["Apple House Limited", null]), false);
    assert.equal(namesMatch("Brightwave", ["Acme Ltd", "Brightwave"]), true);
  });
});

describe("isDistinctiveSlug", () => {
  it("trusts multi-word or long full-name slugs only", () => {
    assert.equal(isDistinctiveSlug({ slug: "monzobank", kind: "full", words: 2 }), true);
    assert.equal(isDistinctiveSlug({ slug: "bloom", kind: "full", words: 1 }), false);
    assert.equal(isDistinctiveSlug({ slug: "thoughtmachine", kind: "full", words: 1 }), true);
    assert.equal(isDistinctiveSlug({ slug: "monzo", kind: "core", words: 1 }), false);
  });
});

const sponsor = { id: 1, name: "Monzo Bank Ltd", tradingName: null };
const hit = (ats: ProbeAts, boardName: string | null, identifier = "monzo", description: string | null = null): BoardHit => ({
  ats,
  identifier,
  careersUrl: `https://example.com/${identifier}`,
  boardName,
  description,
  jobCount: null,
});
const core = { slug: "monzo", kind: "core" as const, words: 1 };
const full = { slug: "monzobank", kind: "full" as const, words: 2 };
const ukJobs = (n: number | null) => async () => n;

describe("judgeHit", () => {
  it("activates a core-name match the board's description confirms, with UK jobs", async () => {
    const v = await judgeHit(hit("greenhouse", "Monzo", "monzo", "We're building the best bank in the world"), core, sponsor, ukJobs(40));
    assert.deepEqual([v?.status, v?.reason, v?.ukJobs], ["active", "core_name_confirmed_uk_jobs", 40]);
  });

  it("holds back a same-named company in another sector (Spire Global vs Spire Healthcare)", async () => {
    const spire = { id: 2, name: "Spire Healthcare Ltd", tradingName: null };
    const v = await judgeHit(hit("greenhouse", "Spire", "spire", "Space-based data and analytics"), core, spire, ukJobs(3));
    assert.deepEqual([v?.status, v?.reason], ["unverified", "needs_job_check"]);
  });

  it("holds back an exact-name board with no UK jobs (a foreign sister firm)", async () => {
    const mazars = { id: 3, name: "Forvis Mazars LLP", tradingName: null };
    const v = await judgeHit(hit("greenhouse", "Forvis Mazars", "forvismazars"), full, mazars, ukJobs(0));
    assert.deepEqual([v?.status, v?.reason], ["unverified", "no_uk_jobs"]);
  });

  it("doesn't need confirmation when only structural words were dropped", async () => {
    const jane = { id: 4, name: "Jane Street Europe Limited", tradingName: null };
    const v = await judgeHit(hit("greenhouse", "Jane Street", "janestreet"), core, jane, ukJobs(12));
    assert.deepEqual([v?.status, v?.reason], ["active", "core_name_confirmed_uk_jobs"]);
  });

  it("doesn't trust very short board names on their own", async () => {
    const map = { id: 5, name: "MAP GROUP (UK) LIMITED", tradingName: null };
    const v = await judgeHit(hit("greenhouse", "MAP", "map"), { slug: "map", kind: "core", words: 1 }, map, ukJobs(4));
    assert.deepEqual([v?.status, v?.reason], ["unverified", "needs_job_check"]);
  });

  it("drops a board that belongs to a different company", async () => {
    assert.equal(await judgeHit(hit("greenhouse", "Monzo Pizza Co"), core, sponsor, ukJobs(5)), null);
  });

  it("trusts a distinctive Lever slug only with UK jobs, and never a weak one", async () => {
    assert.equal((await judgeHit(hit("lever", null, "monzobank"), full, sponsor, ukJobs(2)))?.status, "active");
    assert.equal((await judgeHit(hit("lever", null), core, sponsor, ukJobs(2)))?.status, "unverified");
  });

  it("leaves Ashby boards for the scraper to confirm", async () => {
    assert.deepEqual((await judgeHit(hit("ashby", null, "monzobank"), full, sponsor, ukJobs(null)))?.reason, "needs_job_check");
  });
});

describe("discoverSponsor", () => {
  it("stops once a confirmed board is found", async () => {
    const calls: string[] = [];
    const probe: ProbeFn = async (ats, slug) => {
      calls.push(`${ats}:${slug}`);
      return ats === "lever" && slug === "monzobank" ? hit("lever", null, "monzobank") : null;
    };
    const out = await discoverSponsor(sponsor, probe, ukJobs(3));
    assert.deepEqual(out.verdicts.map((v) => `${v.status}:${v.hit.ats}`), ["active:lever"]);
    assert.ok(!calls.some((c) => c.endsWith(":monzo")));
  });

  it("flags a blocked host so the sponsor is retried", async () => {
    const probe: ProbeFn = async (ats) => {
      if (ats === "ashby") throw new HostBlockedError("api.ashbyhq.com", 86_400_000);
      return null;
    };
    const out = await discoverSponsor(sponsor, probe, ukJobs(0));
    assert.equal(out.blocked, true);
  });

  it("reports ordinary probe failures without losing hits", async () => {
    const probe: ProbeFn = async (ats, slug) => {
      if (ats === "ashby") throw new Error("HTTP 503");
      return ats === "greenhouse" && slug === "monzo" ? hit("greenhouse", "Monzo", "monzo", "a bank") : null;
    };
    const out = await discoverSponsor(sponsor, probe, ukJobs(10));
    assert.deepEqual([out.verdicts[0]?.status, out.blocked], ["active", false]);
    assert.ok(out.errors.length > 0);
  });
});

describe("sector descriptors", () => {
  it("are dropped from the core name", () => {
    assert.ok(slugCandidates("Wise Payments Limited", null).some((c) => c.slug === "wise"));
    assert.equal(namesMatch("Wise", ["Wise Payments Limited", null]), true);
  });
});
