import { MONTHLY_CAP_USD } from "@/lib/reading/budget";

/**
 * The run report sent to Telegram after each workflow: what the run did and what needs
 * attention. Telegram's HTML mode: only <b>, <i>, <a>, <code> are used, and all data is escaped.
 */

export type ScrapeReport = {
  sources: number;
  stored: number;
  errors: number;
  ukJobs: number;
  inserted: number;
  expired: number;
  needsReview: number;
  errorSamples: string[];
  blockedHosts: string[];
  aiUsage: { estimatedCostUsd: number } | null;
};
export type ClassifyReport = { titles: number; classified: number; failedBatches: number; stopped: string | null; estimatedCostUsd: number };
export type ReadReport = {
  read: number;
  failed: number;
  stopped: string | null;
  costUsd: number;
  monthToDateUsd: number;
  projectedMonthUsd: number;
  /** Live jobs without a reading of their current text: hidden until read. */
  waiting: number;
  oldestWaitingHours: number | null;
};
export type ScoreReport = { scored: number };
export type Health = {
  liveJobs: number;
  passingJobs: number;
  failingSources: { label: string; error: string | null }[];
  failingCount: number;
  /** Workflows whose last success is older than expected. */
  stale: { kind: string; lastSuccess: string | null }[];
};

export type RunReportInput = {
  workflow: string;
  /** GitHub's job.status: success, failure or cancelled. */
  status: string;
  runUrl: string | null;
  scrape?: ScrapeReport | null;
  classify?: ClassifyReport | null;
  read?: ReadReport | null;
  score?: ScoreReport | null;
  health?: Health | null;
};

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (v: number) => v.toLocaleString("en-GB");
const usd = (v: number) => `$${v.toFixed(2)}`;
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

const STATUS: Record<string, string> = { success: "finished", failure: "FAILED", cancelled: "was cancelled" };

export function formatRunReport(r: RunReportInput): string {
  const ok = r.status === "success";
  const lines: string[] = [`${ok ? "✅" : "❌"} <b>${escapeHtml(r.workflow)} ${STATUS[r.status] ?? escapeHtml(r.status)}</b>`];
  const attention: string[] = [];

  if (r.scrape) {
    const s = r.scrape;
    lines.push(
      s.sources === 0
        ? "No sources were due for a crawl"
        : `+${n(s.inserted)} new, ${n(s.expired)} expired, from ${plural(s.sources, "source")}${s.errors ? ` (${n(s.errors)} failed)` : ""}`,
    );
    if (s.errors) attention.push(...s.errorSamples.slice(0, 5).map((e) => `• <code>${escapeHtml(e.slice(0, 140))}</code>`));
    if (s.blockedHosts.length) attention.push(...s.blockedHosts.slice(0, 3).map((h) => `• Blocked: ${escapeHtml(h.slice(0, 140))}`));
    if (s.needsReview) attention.push(`• ${plural(s.needsReview, "board")} waiting for review`);
  } else if (r.workflow === "Scrape" && !ok) {
    lines.push("The scrape step didn't finish.");
  }

  if (r.classify) {
    const c = r.classify;
    lines.push(`Classified ${plural(c.classified, "new title")} (${usd(c.estimatedCostUsd)})`);
    if (c.stopped) attention.push(`• Classification stopped: ${escapeHtml(c.stopped)}`);
    if (c.failedBatches) attention.push(`• ${plural(c.failedBatches, "classification batch", "classification batches")} failed; they retry next run`);
  }
  if (r.read) {
    const d = r.read;
    lines.push(`Read ${plural(d.read, "new or changed ad")} (${usd(d.costUsd)})`);
    lines.push(`AI reading this month: ${usd(d.monthToDateUsd)}, on course for ${usd(d.projectedMonthUsd)}`);
    if (d.stopped) attention.push(`• Reading stopped: ${escapeHtml(d.stopped)}`);
    if (d.waiting && (d.oldestWaitingHours ?? 0) > 12) {
      attention.push(`• ${plural(d.waiting, "job")} waiting to be read (oldest ${n(d.oldestWaitingHours!)} hours); they stay hidden until read`);
    }
    if (d.projectedMonthUsd > MONTHLY_CAP_USD) {
      attention.push(`• AI reading is on course for ${usd(d.projectedMonthUsd)} this month, over the ${usd(MONTHLY_CAP_USD).replace(".00", "")} limit: time to switch to the Batch API`);
    }
    if (d.failed) attention.push(`• ${plural(d.failed, "ad")} couldn't be read; they retry next run`);
  }
  if (r.score) lines.push(`Scored ${plural(r.score.scored, "job")}`);

  const ai = (r.scrape?.aiUsage?.estimatedCostUsd ?? 0) + (r.classify?.estimatedCostUsd ?? 0) + (r.read?.costUsd ?? 0);
  if (r.scrape?.aiUsage && ai > 0) lines.push(`AI cost this run: ${usd(ai)}`);

  if (r.health) {
    const h = r.health;
    lines.push(`Live jobs: ${n(h.liveJobs)} (${n(h.passingJobs)} pass the check)`);
    if (h.failingCount) {
      attention.push(`• ${plural(h.failingCount, "source")} failing 3+ runs in a row:`);
      attention.push(...h.failingSources.slice(0, 5).map((f) => `  ${escapeHtml(f.label)}${f.error ? `: <code>${escapeHtml(f.error.slice(0, 100))}</code>` : ""}`));
    }
    for (const s of h.stale) attention.push(`• ${escapeHtml(s.kind)} hasn't succeeded ${s.lastSuccess ? `since ${escapeHtml(s.lastSuccess)}` : "yet"}`);
  }

  const link = r.runUrl ? ["", `<a href="${escapeHtml(r.runUrl).replace(/"/g, "&quot;")}">Open the run</a>`] : [];
  const render = (items: string[], more: number) =>
    [...lines, ...(items.length ? ["", "<b>Needs attention</b>", ...items, ...(more ? [`…and ${n(more)} more in the run log`] : [])] : []), ...link].join("\n");
  // Telegram's limit is 4,096 characters. Whole lines are dropped, never cut, so no tag is left open.
  let kept = attention.length;
  while (kept > 0 && render(attention.slice(0, kept), attention.length - kept).length > 4000) kept--;
  return render(attention.slice(0, kept), attention.length - kept);
}
