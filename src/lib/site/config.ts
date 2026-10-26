/** Site-wide facts used by pages, metadata, structured data and the legal pages. */

export const SITE_NAME = "Visa Sponsor Jobs UK";

/** "visasponsorjobsuk.com", "https://visasponsorjobsuk.com/" and the like, as "https://visasponsorjobsuk.com". */
export function normaliseSiteUrl(value: string | undefined): string {
  const v = value?.trim();
  if (!v) return "http://localhost:3000";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return new URL(withScheme).origin;
}

export const SITE_URL = normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** Contact and data-protection requests. Set NEXT_PUBLIC_CONTACT_EMAIL to a mailbox that's read. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? `hello@${new URL(SITE_URL).hostname.replace(/^www\./, "")}`;

export const SITE_DESCRIPTION =
  "Graduate and early-career jobs at UK employers licensed to sponsor Skilled Worker visas, each checked against the salary and occupation rules.";

/** The legal pages' "last updated" date. Change it whenever their wording changes. */
export const LEGAL_UPDATED = "2026-10-26";

export const absoluteUrl = (path: string) => new URL(path, `${SITE_URL}/`).toString();
