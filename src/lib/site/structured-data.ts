import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./config";

/**
 * schema.org data for search engines: JobPosting on job pages (Google's job search), and
 * WebSite + Organization on the home page.
 */

export type JobForSchema = {
  slug: string;
  title: string;
  employerName: string;
  locationText: string | null;
  isRemote: boolean;
  snippet: string | null;
  employmentType: string | null;
  salaryAnnualMin: number | null;
  salaryAnnualMax: number | null;
  postedAt: string | null;
  firstSeenAt: string;
  closingDate: string | null;
};

/** ATS contract labels to Google's employmentType values. */
export function schemaEmploymentType(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  const types = [
    /full[\s_-]?time/.test(v) && "FULL_TIME",
    /part[\s_-]?time/.test(v) && "PART_TIME",
    /contract|contractor|freelance/.test(v) && "CONTRACTOR",
    /temporary|fixed[\s_-]?term|\bftc\b/.test(v) && "TEMPORARY",
    /intern/.test(v) && "INTERN",
  ].filter((t): t is string => !!t);
  return types.length ? [...new Set(types)] : undefined;
}

export function jobPostingJsonLd(job: JobForSchema): Record<string, unknown> {
  const description = [
    job.snippet,
    `${job.employerName} is on the Home Office Register of Licensed Sponsors. See how this job measures up to the Skilled Worker visa rules on ${SITE_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description,
    datePosted: job.postedAt ?? job.firstSeenAt,
    // A closing date means "open until the end of that day".
    ...(job.closingDate ? { validThrough: `${job.closingDate}T23:59:59+00:00` } : {}),
    hiringOrganization: { "@type": "Organization", name: job.employerName },
    ...(job.isRemote
      ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "United Kingdom" } }
      : {}),
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", ...(job.locationText ? { addressLocality: job.locationText } : {}), addressCountry: "GB" },
    },
    ...(schemaEmploymentType(job.employmentType) ? { employmentType: schemaEmploymentType(job.employmentType) } : {}),
    ...(job.salaryAnnualMin !== null
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "GBP",
            value: {
              "@type": "QuantitativeValue",
              unitText: "YEAR",
              ...(job.salaryAnnualMax !== null && job.salaryAnnualMax > job.salaryAnnualMin
                ? { minValue: job.salaryAnnualMin, maxValue: job.salaryAnnualMax }
                : { value: job.salaryAnnualMin }),
            },
          },
        }
      : {}),
    // Applying happens on the employer's site, not here.
    directApply: false,
    url: absoluteUrl(`/jobs/${job.slug}`),
  };
}

export function siteJsonLd(): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      inLanguage: "en-GB",
      potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
    { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/`, logo: absoluteUrl("/icon.svg") },
  ];
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so job text can't close the tag. */
export const jsonLdScript = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
