import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobSlug } from "@/lib/scrape/pipeline";
import { sponsorSlug } from "./queries";
import { isPlausiblePagePath } from "./slug-shape";

describe("isPlausiblePagePath", () => {
  it("accepts every slug the site actually makes", () => {
    for (const [title, employer] of [["Graduate Data Scientist", "Wise Payments Limited"], ["C++ Engineer (London)", "Ünïcode Ltd"], ["A", "B"], ["x".repeat(200), "y".repeat(80)]]) {
      const slug = jobSlug(title, employer, 12, "R123");
      assert.ok(isPlausiblePagePath(`/jobs/${slug}`), slug);
    }
    assert.ok(isPlausiblePagePath(`/sponsors/${sponsorSlug({ id: 64764, name: "Leonardo UK Ltd" })}`));
    assert.ok(isPlausiblePagePath("/sponsors/leonardo-uk-ltd-64764/"));
    assert.ok(isPlausiblePagePath(`/jobs/${jobSlug("Nurse", "NHS Trust", 1, "x")}/opengraph-image`));
  });

  it("leaves other pages alone, including the opengraph images under a job", () => {
    for (const p of ["/", "/jobs", "/sponsors", "/how-we-check", "/account/jobs"]) assert.ok(isPlausiblePagePath(p), p);
  });

  it("refuses junk that scanners and bots request", () => {
    for (const p of ["/jobs/wp-login.php", "/jobs/made-up-123", "/jobs/../admin", "/jobs/ABCDEF-123abc", "/sponsors/leonardo", "/sponsors/x-0", "/jobs/wp-admin/setup.php", `/jobs/${"a".repeat(130)}-abcdef`]) {
      assert.equal(isPlausiblePagePath(p), false, p);
    }
  });
});
