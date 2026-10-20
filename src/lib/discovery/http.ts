const CONTACT = process.env.CRAWLER_CONTACT_URL ?? "https://github.com/febinfelix23/visasponsorjobsuk";
export const USER_AGENT = `VisaSponsorJobsUKBot/0.1 (+${CONTACT})`;

const TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [2_000, 8_000];
/** A 429 asking us to wait longer than this means we're blocked, not briefly throttled. */
const MAX_RETRY_AFTER_MS = 120_000;

/** Caps concurrent requests to one host and spaces their starts out. */
export function createLimiter(concurrency: number, minIntervalMs: number) {
  let active = 0;
  let lastStart = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    const wait = Math.max(0, lastStart + minIntervalMs - Date.now());
    if (wait > 0) {
      setTimeout(next, wait);
      return;
    }
    active++;
    lastStart = Date.now();
    queue.shift()!();
  };

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      return await task();
    } finally {
      active--;
      next();
    }
  };
}

export type HttpResult = { status: number; body: unknown };

/** Thrown when a host keeps failing (network, 5xx); the probe is retried on a later run. */
export class TransientHttpError extends Error {}

/**
 * Thrown when a host has rate-limited us for a long time. Every later request to
 * that host fails fast with this too, so a run stops hammering it.
 */
export class HostBlockedError extends Error {
  constructor(
    readonly host: string,
    readonly retryAfterMs: number,
  ) {
    super(`${host} is rate-limiting us (retry after ${Math.round(retryAfterMs / 60_000)} min)`);
  }
}

const blockedHosts = new Map<string, HostBlockedError>();
export const getBlockedHosts = () => [...blockedHosts.values()];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export async function requestJson(url: string, init: { method?: "GET" | "HEAD" } = {}): Promise<HttpResult> {
  const host = new URL(url).host;
  let lastError = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const blocked = blockedHosts.get(host);
    if (blocked) throw blocked;
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      const res = await fetch(url, {
        method: init.method ?? "GET",
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
      });
      if (res.status === 429) {
        await res.body?.cancel();
        const wait = retryAfterMs(res.headers.get("retry-after"));
        if (wait !== null && wait > MAX_RETRY_AFTER_MS) {
          const error = new HostBlockedError(host, wait);
          blockedHosts.set(host, error);
          throw error;
        }
        lastError = "HTTP 429";
        if (wait) await sleep(wait);
        continue;
      }
      if (res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        await res.body?.cancel();
        continue;
      }
      if (init.method === "HEAD" || !res.ok) {
        await res.body?.cancel();
        return { status: res.status, body: null };
      }
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } catch (error) {
      if (error instanceof HostBlockedError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new TransientHttpError(`${url}: ${lastError}`);
}
