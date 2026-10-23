import { requestJson } from "@/lib/http";
import { limited } from "../limits";
import { capDescription, htmlToText, parseDate } from "../text";
import { emptyJob, type Adapter } from "../types";

type SrPosting = {
  id: string;
  name: string;
  ref: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string };
  typeOfEmployment?: { label?: string };
  department?: { label?: string };
  function?: { label?: string };
};
type SrDetail = {
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/**
 * The list endpoint filters to the UK (country=gb) but has no descriptions, so each
 * new posting needs one detail request; postings already stored are skipped.
 */
export const smartrecruiters: Adapter = async (source, ctx) => {
  const base = `https://api.smartrecruiters.com/v1/companies/${source.identifier}/postings`;
  const postings: SrPosting[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${base}?country=gb&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const { status, body } = await limited(url, () => requestJson(url));
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const data = body as { totalFound?: number; content?: SrPosting[] } | null;
    postings.push(...(data?.content ?? []));
    if (!data?.content?.length || postings.length >= (data.totalFound ?? 0)) break;
  }

  const jobs = [];
  for (const p of postings) {
    let description: string | undefined;
    let applyUrl = `https://jobs.smartrecruiters.com/${source.identifier}/${p.id}`;
    if (!ctx.knownIds.has(p.id)) {
      const { status, body } = await limited(p.ref, () => requestJson(p.ref));
      if (status === 200) {
        const detail = body as SrDetail;
        const sections = Object.values(detail.jobAd?.sections ?? {});
        description = capDescription(sections.map((s) => `${s.title ?? ""}\n${htmlToText(s.text)}`).join("\n\n"));
        applyUrl = detail.postingUrl ?? applyUrl;
      }
    }
    const loc = p.location;
    jobs.push(
      emptyJob({
        externalId: p.id,
        title: p.name.trim(),
        applyUrl,
        locationText: loc?.fullLocation ?? ([loc?.city, loc?.region].filter(Boolean).join(", ") || null),
        isRemote: loc?.remote === true,
        postedAt: parseDate(p.releasedDate),
        employmentType: p.typeOfEmployment?.label ?? null,
        department: p.department?.label ?? p.function?.label ?? null,
        description,
      }),
    );
  }
  return jobs;
};
