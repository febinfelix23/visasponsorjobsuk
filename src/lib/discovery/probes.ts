import { isUkCountryCode, isUkLocation } from "@/lib/geo/uk";
import { createLimiter, requestJson } from "@/lib/http";

export type ProbeAts = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

/** A board that exists for a slug. `boardName`/`description` are null when the ATS doesn't expose them. */
export type BoardHit = {
  ats: ProbeAts;
  identifier: string;
  careersUrl: string;
  boardName: string | null;
  description: string | null;
  jobCount: number | null;
};

// Per-host politeness: a few requests in flight, starts spaced out.
// Workable is deliberately absent: its widget API blocks an IP for 24h after modest
// slug probing, so Workable boards are found from company websites instead (Phase 2).
const limiters: Record<ProbeAts, ReturnType<typeof createLimiter>> = {
  greenhouse: createLimiter(4, 50),
  lever: createLimiter(4, 50),
  ashby: createLimiter(3, 100),
  smartrecruiters: createLimiter(3, 100),
};

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

async function greenhouse(slug: string): Promise<BoardHit | null> {
  const { status, body } = await limiters.greenhouse(() =>
    requestJson(`https://boards-api.greenhouse.io/v1/boards/${slug}`),
  );
  if (status !== 200) return null;
  const data = body as { name?: string; content?: string } | null;
  return {
    ats: "greenhouse",
    identifier: slug,
    careersUrl: `https://job-boards.greenhouse.io/${slug}`,
    boardName: data?.name?.trim() ?? null,
    description: data?.content ? stripHtml(data.content) : null,
    jobCount: null,
  };
}

/** Lever runs separate US and EU instances; UK companies are often on the EU one. */
async function lever(slug: string): Promise<BoardHit | null> {
  for (const region of ["", "eu."] as const) {
    const { status, body } = await limiters.lever(() =>
      requestJson(`https://api.${region}lever.co/v0/postings/${slug}?mode=json&limit=1`),
    );
    if (status === 200 && Array.isArray(body)) {
      return {
        ats: "lever",
        identifier: region ? `eu/${slug}` : slug,
        careersUrl: `https://jobs.${region}lever.co/${slug}`,
        boardName: null,
        description: null,
        jobCount: null,
      };
    }
  }
  return null;
}

/** HEAD keeps this cheap: the posting API returns the whole board, descriptions included. */
async function ashby(slug: string): Promise<BoardHit | null> {
  const { status } = await limiters.ashby(() =>
    requestJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { method: "HEAD" }),
  );
  if (status !== 200) return null;
  return {
    ats: "ashby",
    identifier: slug,
    careersUrl: `https://jobs.ashbyhq.com/${slug}`,
    boardName: null,
    description: null,
    jobCount: null,
  };
}

/** Returns 200 with zero results for any slug, so only a non-empty board counts as a hit. */
async function smartrecruiters(slug: string): Promise<BoardHit | null> {
  const { status, body } = await limiters.smartrecruiters(() =>
    requestJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`),
  );
  const data = body as { totalFound?: number; content?: { company?: { identifier?: string; name?: string } }[] } | null;
  if (status !== 200 || !data?.totalFound) return null;
  const company = data.content?.[0]?.company;
  const identifier = company?.identifier ?? slug;
  return {
    ats: "smartrecruiters",
    identifier,
    careersUrl: `https://jobs.smartrecruiters.com/${identifier}`,
    boardName: company?.name?.trim() ?? null,
    description: null,
    jobCount: data.totalFound,
  };
}

export const PROBES: Record<ProbeAts, (slug: string) => Promise<BoardHit | null>> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
};

/** ATSes whose API returns the employer's name, so a hit can be checked against the sponsor. */
export const NAMED_ATS: ReadonlySet<ProbeAts> = new Set(["greenhouse", "smartrecruiters"]);

/**
 * Number of current UK jobs on a board, or null when the ATS can't tell us cheaply
 * (Ashby returns the whole board, so it's left to the scraper).
 */
export async function countUkJobs(hit: BoardHit): Promise<number | null> {
  switch (hit.ats) {
    case "greenhouse": {
      const { status, body } = await limiters.greenhouse(() =>
        requestJson(`https://boards-api.greenhouse.io/v1/boards/${hit.identifier}/jobs`),
      );
      const jobs = (body as { jobs?: { location?: { name?: string } }[] } | null)?.jobs;
      return status === 200 && jobs ? jobs.filter((j) => isUkLocation(j.location?.name)).length : 0;
    }
    case "lever": {
      const [region, slug] = hit.identifier.startsWith("eu/") ? ["eu.", hit.identifier.slice(3)] : ["", hit.identifier];
      const { status, body } = await limiters.lever(() =>
        requestJson(`https://api.${region}lever.co/v0/postings/${slug}?mode=json&limit=200`),
      );
      if (status !== 200 || !Array.isArray(body)) return 0;
      return (body as { country?: string; categories?: { location?: string } }[]).filter(
        (p) => isUkCountryCode(p.country) || isUkLocation(p.categories?.location),
      ).length;
    }
    case "smartrecruiters": {
      const { status, body } = await limiters.smartrecruiters(() =>
        requestJson(`https://api.smartrecruiters.com/v1/companies/${hit.identifier}/postings?country=gb&limit=1`),
      );
      return status === 200 ? ((body as { totalFound?: number } | null)?.totalFound ?? 0) : 0;
    }
    case "ashby":
      return null;
  }
}
