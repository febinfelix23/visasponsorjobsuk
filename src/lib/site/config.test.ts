import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normaliseSiteUrl } from "./config";

describe("normaliseSiteUrl", () => {
  it("accepts a bare domain, as typed into a hosting dashboard", () => {
    assert.equal(normaliseSiteUrl("visasponsorjobsuk.com"), "https://visasponsorjobsuk.com");
    assert.equal(normaliseSiteUrl(" www.visasponsorjobsuk.com "), "https://www.visasponsorjobsuk.com");
  });

  it("keeps a full address and drops any trailing slash or path", () => {
    assert.equal(normaliseSiteUrl("https://visasponsorjobsuk.com/"), "https://visasponsorjobsuk.com");
    assert.equal(normaliseSiteUrl("http://localhost:3000"), "http://localhost:3000");
  });

  it("falls back to the local dev server when unset", () => {
    assert.equal(normaliseSiteUrl(undefined), "http://localhost:3000");
    assert.equal(normaliseSiteUrl(""), "http://localhost:3000");
  });
});
