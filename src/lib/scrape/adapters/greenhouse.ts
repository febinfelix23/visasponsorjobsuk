import { isUkLocation } from "@/lib/geo/uk";
import { requestJson } from "@/lib/http";
import { limited } from "../limits";
import { capDescription, htmlToText, parseDate } from "../text";
import { emptyJob, type Adapter } from "../types";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  offices?: { name?: string; location?: string | null }[];
  departments?: { name?: string }[];
  first_published?: string;
  updated_at?: string;
  content?: string;
};

/** One request returns every job with its description (content=true). */
export const greenhouse: Adapter = async (source) => {
  const url = `https://boards-api.greenhouse.io/v1/boards/${source.identifier}/jobs?content=true`;
  const { status, body } = await limited(url, () => requestJson(url));
  if (status === 404) throw new Error("Board no longer exists (404)");
  if (status !== 200) throw new Error(`HTTP ${status}`);
  const jobs = (body as { jobs?: GreenhouseJob[] } | null)?.jobs ?? [];

  return jobs
    .filter((j) => {
      const places = [j.location?.name, ...(j.offices ?? []).flatMap((o) => [o.name, o.location])];
      return places.some((p) => isUkLocation(p));
    })
    .map((j) =>
      emptyJob({
        externalId: String(j.id),
        title: j.title.trim(),
        applyUrl: j.absolute_url,
        locationText: j.location?.name?.trim() || null,
        isRemote: /remote/i.test(j.location?.name ?? ""),
        postedAt: parseDate(j.first_published ?? j.updated_at),
        department: j.departments?.[0]?.name ?? null,
        description: capDescription(htmlToText(j.content)),
      }),
    );
};
