import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatComparison, summariseChanges } from "./compare";

describe("summariseChanges", () => {
  const change = (id: number, before: string, after: string, reason = "x") => ({ id, title: `Job ${id}`, before, after, reason });

  it("counts stamps before and after, and groups the changes, biggest first", () => {
    const s = summariseChanges([change(1, "likely_eligible", "ineligible"), change(2, "likely_eligible", "ineligible"), change(3, "check_with_employer", "check_with_employer"), change(4, "sponsorship_mentioned", "check_with_employer")], 1);
    assert.deepEqual(s.before, { likely_eligible: 2, check_with_employer: 1, sponsorship_mentioned: 1 });
    assert.deepEqual(s.after, { ineligible: 2, check_with_employer: 2 });
    assert.deepEqual(s.moves.map((m) => [m.from, m.to, m.count, m.samples.length]), [["likely_eligible", "ineligible", 2, 1], ["sponsorship_mentioned", "check_with_employer", 1, 1]]);
    assert.equal(s.unchanged, 1);
  });

  it("writes a short Telegram summary with the stamps' own names", () => {
    const s = summariseChanges([change(1, "likely_eligible", "ineligible", "ad_says_no_sponsorship")], 3);
    const text = formatComparison(s, 16100);
    assert.match(text, /Likely eligible 1 → 0/);
    assert.match(text, /Not sponsorable 0 → 1/);
    assert.match(text, /Likely eligible → Not sponsorable: 1/);
    assert.match(text, /#1 Job 1 \(ad_says_no_sponsorship\)/);
    assert.ok(text.length < 4000);
  });
});
