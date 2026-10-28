/**
 * Monthly spending on AI reading. The hard cap stops reading; the projection warns in the
 * run report well before that, which is the cue to move to the (half-price) Batch API.
 */
export const MONTHLY_CAP_USD = 15;

/** What's left to spend this month. */
export const budgetLeftUsd = (monthToDateUsd: number) => Math.max(0, MONTHLY_CAP_USD - monthToDateUsd);

/** Spend so far scaled to the whole month (UTC). In the month's first day it's just the spend. */
export function projectMonthUsd(monthToDateUsd: number, now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsed = now.getTime() - start;
  if (elapsed < 86_400_000) return monthToDateUsd;
  return Math.round((monthToDateUsd * (end - start)) / elapsed * 100) / 100;
}
