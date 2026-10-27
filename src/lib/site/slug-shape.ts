/**
 * Whether a /jobs or /sponsors address could be a real page, from its shape alone.
 * Job slugs end in a 6-character hex hash (lib/scrape/pipeline jobSlug), sponsor slugs in
 * the sponsor's ID (sponsorSlug). Anything else is refused before the page renders: each
 * rendered page is stored, and stores (ISR writes) are billed, so junk URLs from scanners
 * mustn't create them.
 */
const JOB = /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{6}$/;
const SPONSOR = /^[a-z0-9]+(?:-[a-z0-9]+)*-[1-9][0-9]{0,9}$/;

export function isPlausiblePagePath(pathname: string): boolean {
  // Only the job or sponsor part is checked; what follows it (the opengraph-image) is the page's own.
  const m = /^\/(jobs|sponsors)\/([^/]+)(?:\/.*)?$/.exec(pathname);
  if (!m) return true;
  const slug = m[2];
  if (slug.length > 120) return false;
  return m[1] === "jobs" ? JOB.test(slug) : SPONSOR.test(slug);
}
