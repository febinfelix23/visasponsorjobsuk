import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { utmQuery } from "./utm";

const q = (s: string) => utmQuery(new URLSearchParams(s));

describe("utmQuery", () => {
  it("keeps a post's UTM tags and drops everything else", () => {
    assert.equal(q("utm_source=telegram&utm_medium=social&utm_campaign=daily-2026-10-25&field=data"), "utm_source=telegram&utm_medium=social&utm_campaign=daily-2026-10-25");
  });

  it("is empty for an untagged visit", () => {
    assert.equal(q("field=data"), "");
    assert.equal(q("utm_medium=social"), "");
  });

  it("refuses values that aren't plain tags", () => {
    assert.equal(q("utm_source=<script>"), "");
    assert.equal(q(`utm_source=reddit&utm_campaign=${"x".repeat(80)}`), "utm_source=reddit");
  });
});
