import { isUkCountryCode, isUkLocation } from "@/lib/geo/uk";
import { requestJson } from "@/lib/http";
import { limited } from "../limits";
import { capDescription, htmlToText, parseDate } from "../text";
import { emptyJob, type Adapter, type RawJob } from "../types";

/** Workday's global ID for the United Kingdom, shared by every tenant's country facet. */
const UK_COUNTRY_ID = "29247e57dbaf46fb855b224e03170bc7";
const PAGE_SIZE = 20; // Workday's maximum
const MAX_PAGES = 60;

type FacetValue = { descriptor?: string; id?: string; facetParameter?: string; values?: FacetValue[] };
type Facet = { facetParameter?: string; values?: FacetValue[] };
type ListResponse = {
  total?: number;
  facets?: Facet[];
  jobPostings?: { title?: string; externalPath?: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }[];
};
type DetailResponse = {
  jobPostingInfo?: {
    title?: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    country?: { descriptor?: string; id?: string };
    startDate?: string;
    timeType?: string;
    externalUrl?: string;
    remoteType?: string;
  };
};

/**
 * Picks the facet filter that limits results to the UK: a country facet when the
 * tenant has one, otherwise the tenant's UK office locations.
 */
export function ukFacetFilter(facets: Facet[]): Record<string, string[]> | null {
  const groups: Facet[] = facets.flatMap((f) => [
    f,
    ...(f.values ?? []).filter((v) => Array.isArray(v.values)).map((v) => ({ facetParameter: v.facetParameter, values: v.values })),
  ]);
  for (const g of groups) {
    if (g.facetParameter && g.values?.some((v) => v.id === UK_COUNTRY_ID)) return { [g.facetParameter]: [UK_COUNTRY_ID] };
  }
  for (const g of groups) {
    if (!g.facetParameter || !/location/i.test(g.facetParameter)) continue;
    const ids = (g.values ?? []).filter((v) => v.id && !Array.isArray(v.values) && isUkLocation(v.descriptor)).map((v) => v.id!);
    if (ids.length > 0) return { [g.facetParameter]: ids };
  }
  return null;
}

/** "Posted Today", "Posted 3 Days Ago", "Posted 30+ Days Ago" → an approximate date. */
export function approximatePostedOn(text: string | undefined, now = new Date()): Date | null {
  if (!text) return null;
  if (/today/i.test(text)) return now;
  if (/yesterday/i.test(text)) return new Date(now.getTime() - 86_400_000);
  const days = /(\d+)\+?\s*days?/i.exec(text);
  return days ? new Date(now.getTime() - Number(days[1]) * 86_400_000) : null;
}

/**
 * Identifier is "host/tenant/site", e.g. "barclays.wd3/barclays/External_Career_Site_Barclays".
 * Set discovery.ukOnly for UK-only sites whose facets don't expose the country.
 */
export const workday: Adapter = async (source, ctx) => {
  const [host, tenant, site] = source.identifier.split("/");
  if (!host || !tenant || !site) throw new Error(`Bad Workday identifier "${source.identifier}"`);
  const origin = `https://${host}.myworkdayjobs.com`;
  const api = `${origin}/wday/cxs/${tenant}/${site}`;
  const ukOnly = source.discovery?.ukOnly === true;

  const list = (appliedFacets: Record<string, string[]>, offset: number) =>
    limited(api, () => requestJson(`${api}/jobs`, { json: { appliedFacets, limit: PAGE_SIZE, offset, searchText: "" } }));

  const first = await list({}, 0);
  if (first.status !== 200) throw new Error(`HTTP ${first.status}`);
  const filter = ukOnly ? {} : ukFacetFilter((first.body as ListResponse).facets ?? []);
  // No UK filter available: page everything and check each new job's country from its detail.
  const facets = filter ?? {};

  const postings: NonNullable<ListResponse["jobPostings"]> = [];
  let total = Infinity;
  for (let page = 0; page < MAX_PAGES && postings.length < total; page++) {
    // The unfiltered first page is reusable when no filter applies.
    const res = page === 0 && Object.keys(facets).length === 0 ? first : await list(facets, page * PAGE_SIZE);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = res.body as ListResponse;
    // Workday only reports the total on the first page.
    if (page === 0) total = data.total ?? 0;
    if (!data.jobPostings?.length) break;
    postings.push(...data.jobPostings);
  }

  const jobs: RawJob[] = [];
  for (const p of postings) {
    if (!p.externalPath || !p.title) continue;
    const externalId = p.externalPath;
    const fallbackUrl = `${origin}/en-GB/${site}${p.externalPath}`;

    if (ctx.knownIds.has(externalId)) {
      jobs.push(emptyJob({ externalId, title: p.title.trim(), applyUrl: fallbackUrl, locationText: p.locationsText ?? null, partial: true }));
      continue;
    }

    const detailUrl = `${api}${p.externalPath}`;
    const { status, body } = await limited(detailUrl, () => requestJson(detailUrl));
    if (status !== 200) continue;
    const info = (body as DetailResponse).jobPostingInfo;
    if (!info) continue;
    const places = [info.location, ...(info.additionalLocations ?? [])];
    const inUk =
      ukOnly ||
      info.country?.id === UK_COUNTRY_ID ||
      isUkCountryCode(info.country?.descriptor) ||
      /united kingdom/i.test(info.country?.descriptor ?? "") ||
      places.some((l) => isUkLocation(l));
    if (!inUk) continue;

    jobs.push(
      emptyJob({
        externalId,
        title: (info.title ?? p.title).trim(),
        applyUrl: info.externalUrl ?? fallbackUrl,
        locationText: places.filter(Boolean).join("; ") || p.locationsText || null,
        isRemote: /remote/i.test(info.remoteType ?? ""),
        postedAt: parseDate(info.startDate) ?? approximatePostedOn(p.postedOn),
        employmentType: info.timeType ?? null,
        description: capDescription(htmlToText(info.jobDescription)),
      }),
    );
  }
  return jobs;
};
