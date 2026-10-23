import { isUkCountryCode, isUkLocation } from "@/lib/geo/uk";
import { requestJson } from "@/lib/http";
import { limited } from "../limits";
import { capDescription, parseDate } from "../text";
import { emptyJob, type Adapter, type RawJob } from "../types";

type AshbyAddress = { postalAddress?: { addressCountry?: string; addressLocality?: string } };
type AshbyJob = {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string; address?: AshbyAddress }[];
  address?: AshbyAddress;
  isListed?: boolean;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  employmentType?: string;
  department?: string;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
  compensation?: {
    summaryComponents?: { compensationType?: string; interval?: string; currencyCode?: string; minValue?: number; maxValue?: number }[];
    compensationTierSummary?: string;
  };
};

const ASHBY_INTERVAL: Record<string, RawJob["salaryPeriod"]> = {
  "1 YEAR": "year",
  "1 MONTH": "month",
  "1 WEEK": "week",
  "1 DAY": "day",
  "1 HOUR": "hour",
};

const isUkCountryName = (country?: string) => !!country && (isUkCountryCode(country) || /united kingdom|great britain|england|scotland|wales/i.test(country));

export const ashby: Adapter = async (source) => {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${source.identifier}?includeCompensation=true`;
  const { status, body } = await limited(url, () => requestJson(url));
  if (status === 404) throw new Error("Board no longer exists (404)");
  if (status !== 200) throw new Error(`HTTP ${status}`);
  const jobs = (body as { jobs?: AshbyJob[] } | null)?.jobs ?? [];

  return jobs
    .filter((j) => j.isListed !== false)
    .filter((j) => {
      const addresses = [j.address, ...(j.secondaryLocations ?? []).map((s) => s.address)];
      const names = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)];
      return addresses.some((a) => isUkCountryName(a?.postalAddress?.addressCountry)) || names.some((n) => isUkLocation(n));
    })
    .map((j) => {
      const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary" && c.currencyCode === "GBP");
      return emptyJob({
        externalId: j.id,
        title: j.title.trim(),
        applyUrl: j.jobUrl,
        locationText: [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean).join("; ") || null,
        isRemote: j.isRemote === true || j.workplaceType === "Remote",
        postedAt: parseDate(j.publishedAt),
        employmentType: j.employmentType ?? null,
        department: j.department ?? null,
        salaryText: salary ? (j.compensation?.compensationTierSummary ?? null) : null,
        salaryMin: salary?.minValue ?? null,
        salaryMax: salary?.maxValue ?? null,
        salaryPeriod: salary?.interval ? (ASHBY_INTERVAL[salary.interval] ?? null) : null,
        description: capDescription(j.descriptionPlain ?? ""),
      });
    });
};
