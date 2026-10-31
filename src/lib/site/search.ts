import { isFieldKey } from "@/lib/scoring/fields";
import type { Filters, Sort } from "./queries";

/**
 * The search page's address: the one source for reading filters from the URL and writing
 * them back, shared by the server page and the client filter panel.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

const SORT_KEYS: Sort[] = ["best", "newest", "salary"];

export function parseFilters(sp: SearchParams): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  // "sector" (tech/finance/engineering/healthcare) was the old parameter; keep those links working.
  const legacy: Record<string, string> = { tech: "software" };
  const field = one("field") || legacy[one("sector")] || one("sector");
  const page = Number(one("page"));
  const sort = one("sort") as Sort;
  return {
    q: one("q").trim().slice(0, 80) || undefined,
    location: one("location").trim().slice(0, 60) || undefined,
    field: isFieldKey(field) ? field : undefined,
    show: one("show") === "all" ? "all" : "passes",
    includeSenior: one("senior") === "1",
    gradSchemes: one("grad") === "1",
    entryLevel: one("entry") === "1",
    sort: SORT_KEYS.includes(sort) ? sort : "best",
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 200) : 1,
  };
}

/** The URL's query for these filters, defaults left out; `utm` (a post's tags) is kept first. */
export function filterQuery(f: Filters, page = f.page, utm = ""): string {
  const p = new URLSearchParams(utm);
  if (f.q) p.set("q", f.q);
  if (f.location) p.set("location", f.location);
  if (f.field) p.set("field", f.field);
  if (f.show === "all") p.set("show", "all");
  if (f.includeSenior) p.set("senior", "1");
  if (f.gradSchemes) p.set("grad", "1");
  if (f.entryLevel) p.set("entry", "1");
  if (f.sort !== "best") p.set("sort", f.sort);
  if (page > 1) p.set("page", String(page));
  return p.toString();
}

export const searchHref = (f: Filters, page = f.page, utm = "") => {
  const qs = filterQuery(f, page, utm);
  return qs ? `/?${qs}` : "/";
};

/** How many of the panel's filters differ from the defaults: the count on the phone's Filters button. */
export const activeFilterCount = (f: Filters) => [f.field, f.show === "all", f.includeSenior, f.gradSchemes, f.entryLevel].filter(Boolean).length;
