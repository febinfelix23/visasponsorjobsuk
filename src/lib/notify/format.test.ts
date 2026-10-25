import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml, formatRunReport, type ScrapeReport } from "./format";

const scrape = (over: Partial<ScrapeReport> = {}): ScrapeReport => ({
  sources: 420,
  stored: 418,
  errors: 0,
  ukJobs: 9000,
  inserted: 142,
  expired: 37,
  needsReview: 0,
  errorSamples: [],
  blockedHosts: [],
  aiUsage: { estimatedCostUsd: 0.07 },
  ...over,
});
const health = { liveJobs: 11885, passingJobs: 1340, failingSources: [], failingCount: 0, stale: [] };
const url = "https://github.com/o/r/actions/runs/1";

describe("formatRunReport", () => {
  it("summarises a good scrape in a few lines with nothing to attend to", () => {
    const text = formatRunReport({
      workflow: "Scrape",
      status: "success",
      runUrl: url,
      scrape: scrape(),
      classify: { titles: 567, classified: 567, failedBatches: 0, stopped: null, estimatedCostUsd: 0.03 },
      score: { scored: 1204 },
      health,
    });
    assert.match(text, /^✅ <b>Scrape finished<\/b>/);
    assert.match(text, /\+142 new, 37 expired, from 420 sources\n/);
    assert.match(text, /Classified 567 new titles \(\$0\.03\)/);
    assert.match(text, /Scored 1,204 jobs/);
    assert.match(text, /AI cost this run: \$0\.10/);
    assert.match(text, /Live jobs: 11,885 \(1,340 pass the check\)/);
    assert.doesNotMatch(text, /Needs attention/);
    assert.match(text, /<a href="https:\/\/github\.com\/o\/r\/actions\/runs\/1">Open the run<\/a>$/);
  });

  it("lists failures, failing sources and stale workflows under Needs attention", () => {
    const text = formatRunReport({
      workflow: "Scrape",
      status: "success",
      runUrl: url,
      scrape: scrape({ errors: 2, errorSamples: ["workday/acme: HTTP 500", "lever/x: timeout"] }),
      health: { ...health, failingCount: 1, failingSources: [{ label: "greenhouse/gone", error: "HTTP 404" }], stale: [{ kind: "Register ingest", lastSuccess: "22 Oct" }] },
    });
    assert.match(text, /from 420 sources \(2 failed\)/);
    assert.match(text, /<b>Needs attention<\/b>\n• <code>workday\/acme: HTTP 500<\/code>/);
    assert.match(text, /1 source failing 3\+ runs in a row:\n  greenhouse\/gone: <code>HTTP 404<\/code>/);
    assert.match(text, /• Register ingest hasn't succeeded since 22 Oct/);
  });

  it("reports a failed run even when no step left a summary", () => {
    const text = formatRunReport({ workflow: "Scrape", status: "failure", runUrl: url });
    assert.match(text, /^❌ <b>Scrape FAILED<\/b>\nThe scrape step didn't finish\./);
  });

  it("escapes data so job and error text can't break Telegram's HTML", () => {
    const text = formatRunReport({ workflow: "Scrape", status: "success", runUrl: null, scrape: scrape({ errors: 1, errorSamples: ["x: <b>bad</b> & worse"] }) });
    assert.match(text, /<code>x: &lt;b&gt;bad&lt;\/b&gt; &amp; worse<\/code>/);
  });

  it("flags classification that stopped, such as exhausted credit", () => {
    const text = formatRunReport({ workflow: "Scrape", status: "success", runUrl: null, classify: { titles: 10, classified: 0, failedBatches: 0, stopped: "Anthropic credit exhausted", estimatedCostUsd: 0 } });
    assert.match(text, /• Classification stopped: Anthropic credit exhausted/);
  });

  it("stays under Telegram's message limit", () => {
    const long = Array.from({ length: 50 }, (_, i) => `source/${i}: ${"x".repeat(200)}`);
    const text = formatRunReport({ workflow: "Scrape", status: "success", runUrl: url, scrape: scrape({ errors: 50, errorSamples: long }) });
    assert.ok(text.length <= 4096);
  });
});

describe("formatRunReport, quiet runs", () => {
  it("says when no sources were due instead of counting zero", () => {
    const text = formatRunReport({ workflow: "Scrape", status: "success", runUrl: null, scrape: scrape({ sources: 0, inserted: 0, expired: 0 }) });
    assert.match(text, /No sources were due for a crawl/);
  });

  it("doesn't claim the scrape step failed on a successful run without its summary", () => {
    assert.doesNotMatch(formatRunReport({ workflow: "Scrape", status: "success", runUrl: null }), /didn't finish/);
  });
});

describe("escapeHtml", () => {
  it("escapes the three characters Telegram's HTML mode needs", () => {
    assert.equal(escapeHtml(`a<b>&"c"`), `a&lt;b&gt;&amp;"c"`);
  });
});
