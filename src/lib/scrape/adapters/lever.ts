import { isUkCountryCode, isUkLocation } from "@/lib/geo/uk";
import { requestJson } from "@/lib/http";
import { limited } from "../limits";
import { capDescription, htmlToText, parseDate } from "../text";
import { emptyJob, type Adapter, type RawJob } from "../types";

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  country?: string;
  workplaceType?: string;
  createdAt?: number;
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string; department?: string };
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text?: string; content?: string }[];
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

const LEVER_INTERVAL: Record<string, RawJob["salaryPeriod"]> = {
  "per-year-salary": "year",
  "per-month-salary": "month",
  "per-week-salary": "week",
  "per-day-wage": "day",
  "per-hour-wage": "hour",
};

/** Identifier is "slug" (US instance) or "eu/slug" (EU instance). */
export const lever: Adapter = async (source) => {
  const [region, slug] = source.identifier.startsWith("eu/") ? ["eu.", source.identifier.slice(3)] : ["", source.identifier];
  const url = `https://api.${region}lever.co/v0/postings/${slug}?mode=json`;
  const { status, body } = await limited(url, () => requestJson(url));
  if (status === 404) throw new Error("Board no longer exists (404)");
  if (status !== 200 || !Array.isArray(body)) throw new Error(`HTTP ${status}`);

  return (body as LeverPosting[])
    .filter((p) => {
      const places = [p.categories?.location, ...(p.categories?.allLocations ?? [])];
      return isUkCountryCode(p.country) || places.some((l) => isUkLocation(l));
    })
    .map((p) => {
      const lists = (p.lists ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content)}`).join("\n\n");
      const salary = p.salaryRange?.currency === "GBP" ? p.salaryRange : undefined;
      return emptyJob({
        externalId: p.id,
        title: p.text.trim(),
        applyUrl: p.hostedUrl,
        locationText: (p.categories?.allLocations?.join("; ") || p.categories?.location) ?? null,
        isRemote: p.workplaceType === "remote",
        postedAt: parseDate(p.createdAt),
        employmentType: p.categories?.commitment ?? null,
        department: p.categories?.department ?? p.categories?.team ?? null,
        salaryMin: salary?.min ?? null,
        salaryMax: salary?.max ?? null,
        salaryPeriod: salary?.interval ? (LEVER_INTERVAL[salary.interval] ?? null) : null,
        description: capDescription([p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n\n")),
      });
    });
};
