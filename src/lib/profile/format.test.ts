import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMonthRange } from "./format";

describe("formatMonthRange", () => {
  it("writes experience dates the way a CV does", () => {
    assert.equal(formatMonthRange("2024-09-01", null), "Sep 2024 to now");
    assert.equal(formatMonthRange("2023-06-01", "2023-08-01"), "Jun 2023 to Aug 2023");
    assert.equal(formatMonthRange(null, "2023-08-01"), "Until Aug 2023");
    assert.equal(formatMonthRange(null, null), null);
  });
});
