/**
 * What a change to the scoring rules would do to the live stamps, before it's applied:
 * `npm run score:jobs -- --all --compare` scores every live job in memory and summarises
 * the moves between stamps, with examples of each.
 */

export type StampChange = { id: number; title: string; before: string; after: string; reason: string };

export type Comparison = {
  before: Record<string, number>;
  after: Record<string, number>;
  unchanged: number;
  moves: { from: string; to: string; count: number; samples: StampChange[] }[];
};

const LABEL: Record<string, string> = {
  sponsorship_mentioned: "Sponsorship offered",
  likely_eligible: "Likely eligible",
  check_with_employer: "Check with employer",
  unknown: "Sponsor not confirmed",
  ineligible: "Not sponsorable",
};
const label = (stamp: string) => LABEL[stamp] ?? stamp;

export function summariseChanges(changes: StampChange[], samplesPerMove: number): Comparison {
  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  const moves = new Map<string, Comparison["moves"][number]>();
  let unchanged = 0;
  for (const c of changes) {
    before[c.before] = (before[c.before] ?? 0) + 1;
    after[c.after] = (after[c.after] ?? 0) + 1;
    if (c.before === c.after) {
      unchanged++;
      continue;
    }
    const key = `${c.before}>${c.after}`;
    const move = moves.get(key) ?? { from: c.before, to: c.after, count: 0, samples: [] };
    move.count++;
    if (move.samples.length < samplesPerMove) move.samples.push(c);
    moves.set(key, move);
  }
  return { before, after, unchanged, moves: [...moves.values()].sort((a, b) => b.count - a.count) };
}

/** Plain text for Telegram (under its 4,096-character limit): totals, then each move with examples. */
export function formatComparison(s: Comparison, liveJobs: number): string {
  const n = (v: number) => v.toLocaleString("en-GB");
  const lines = [`Stamps under the new rules (${n(liveJobs)} live jobs, nothing written)`, ""];
  for (const stamp of Object.keys(LABEL)) {
    if (s.before[stamp] || s.after[stamp]) lines.push(`${label(stamp)} ${n(s.before[stamp] ?? 0)} → ${n(s.after[stamp] ?? 0)}`);
  }
  lines.push("", `Unchanged: ${n(s.unchanged)}`);
  for (const m of s.moves) {
    const block = [``, `${label(m.from)} → ${label(m.to)}: ${n(m.count)}`, ...m.samples.map((c) => `  #${c.id} ${c.title.slice(0, 50)} (${c.reason})`)];
    if ([...lines, ...block].join("\n").length > 3900) break;
    lines.push(...block);
  }
  return lines.join("\n");
}
