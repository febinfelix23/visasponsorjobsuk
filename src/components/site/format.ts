import type { Sponsorability } from "@/lib/scoring/score";

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

export function formatSalary(min: number | null, max: number | null): string | null {
  if (min === null) return null;
  return max !== null && max > min ? `${gbp(min)}–${gbp(max)}` : gbp(min);
}

export const SECTOR_LABEL: Record<string, string> = {
  tech: "Tech",
  finance: "Finance",
  engineering: "Engineering",
  healthcare: "Healthcare",
  other: "Other",
};

/** Badge wording: what we found, never a visa outcome. */
export const BADGE: Record<Sponsorability, { label: string; tone: "teal" | "teal-strong" | "amber" | "grey" | "red"; summary: string }> = {
  sponsorship_mentioned: { label: "Ad mentions sponsorship", tone: "teal-strong", summary: "The job ad itself says sponsorship is available." },
  likely_eligible: { label: "Likely eligible", tone: "teal", summary: "Licensed sponsor, eligible occupation, and the salary meets the new-entrant rate." },
  check_with_employer: { label: "Check with employer", tone: "amber", summary: "Licensed sponsor, but we couldn't confirm every rule from the ad." },
  unknown: { label: "Sponsor not confirmed", tone: "grey", summary: "We couldn't match this employer to the sponsor register." },
  ineligible: { label: "Not sponsorable", tone: "red", summary: "Something in the ad or the rules rules out sponsorship." },
};

/** Absolute dates: pages are prerendered and cached, so "3 days ago" would go stale. */
export function formatAdded(iso: string): string {
  return `Added ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}`;
}

export function formatClosing(date: string | null): string | null {
  if (!date) return null;
  return `Closes ${new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}`;
}

/** ATS contract labels ("FullTime", "Full-time", "Permanent - Employee") in plain words. */
export function formatContract(value: string | null): string | null {
  if (!value) return null;
  const v = value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const cleaned = v.replace(/\bemployee\b/g, "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : null;
}

/**
 * Short location for posts and cards: ATS strings like "GB - Luton - Cap. Green 300; GB - Lincoln"
 * or "London, , United Kingdom" become "Luton or Lincoln" and "London".
 */
export function shortLocation(value: string | null): string | null {
  if (!value) return null;
  const places = value
    .split(";")
    .map((part) =>
      part
        .replace(/^\s*(GB|UK|United Kingdom)\s+-\s+/i, "")
        .split(/\s+-\s+/)[0]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ")
        .replace(/,\s*(United Kingdom|UK|GB|England)$/i, "")
        .trim(),
    )
    .filter(Boolean);
  const unique = [...new Set(places)];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} or ${unique[1]}`;
  return `${unique[0]}, ${unique[1]} and ${unique.length - 2} more`;
}
