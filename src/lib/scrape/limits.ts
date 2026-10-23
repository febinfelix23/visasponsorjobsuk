import { createLimiter } from "@/lib/http";

// [concurrent requests, min ms between starts] per host. Workday and NHS Jobs are
// shared infrastructure run by one provider, so they get the gentlest limits.
const HOST_LIMITS: [RegExp, number, number][] = [
  [/greenhouse\.io$/, 4, 50],
  [/lever\.co$/, 4, 50],
  [/ashbyhq\.com$/, 3, 100],
  [/smartrecruiters\.com$/, 3, 150],
  [/myworkdayjobs\.com$/, 2, 300],
  [/jobs\.nhs\.uk$/, 2, 300],
];
const DEFAULT_LIMIT: [number, number] = [2, 250];

const limiters = new Map<string, ReturnType<typeof createLimiter>>();

/** Shared per-host limiter, so parallel source crawls never gang up on one host. */
export function limited<T>(url: string, task: () => Promise<T>): Promise<T> {
  const host = new URL(url).host;
  // Workday tenants live on many subdomains but one platform: limit them together.
  const key = host.endsWith("myworkdayjobs.com") ? "myworkdayjobs.com" : host;
  let limiter = limiters.get(key);
  if (!limiter) {
    const [concurrency, interval] = HOST_LIMITS.find(([pattern]) => pattern.test(host))?.slice(1) as [number, number] ?? DEFAULT_LIMIT;
    limiter = createLimiter(concurrency, interval);
    limiters.set(key, limiter);
  }
  return limiter(task);
}
