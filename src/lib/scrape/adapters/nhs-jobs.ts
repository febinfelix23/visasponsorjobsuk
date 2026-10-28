import { requestText } from "@/lib/http";
import { limited } from "../limits";
import { capDescription, decodeEntities, htmlToText, parseDate } from "../text";
import { emptyJob, type Adapter, type RawJob } from "../types";

const SEARCH = "https://www.jobs.nhs.uk/api/v1/search_xml";
const ADVERT = "https://www.jobs.nhs.uk/candidate/jobadvert/";
// 10 results a page. NHS_MAX_PAGES caps it for local testing.
const MAX_PAGES_PER_QUERY = Number(process.env.NHS_MAX_PAGES) || 400;

/**
 * Graduate-relevant slices of NHS Jobs: every medical post (doctors' grades are
 * filtered by title later) and Band 5–6 posts in the registered professions.
 */
export const NHS_QUERIES = [
  "staffGroup=MEDICAL_AND_DENTAL",
  "staffGroup=NURSING_AND_MIDWIFERY_REGD&payBand=BAND_5,BAND_6",
  "staffGroup=ALLIED_HEALTH_PROF&payBand=BAND_5,BAND_6",
  "staffGroup=HEALTHCARE_SCIENTISTS&payBand=BAND_5,BAND_6",
  "staffGroup=PROF_SCIENTIFIC_AND_TECHNICAL&payBand=BAND_5,BAND_6",
];

type Vacancy = {
  reference: string;
  title: string;
  employer: string;
  type: string;
  salary: string;
  closeDate: string;
  postDate: string;
  url: string;
};

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? decodeEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, "")).trim() : "";
};

export function parseSearchXml(xml: string): { vacancies: Vacancy[]; totalPages: number } {
  const vacancies = [...xml.matchAll(/<vacancyDetails>([\s\S]*?)<\/vacancyDetails>/g)].map(([, b]) => ({
    reference: tag(b, "reference"),
    title: tag(b, "title"),
    employer: tag(b, "employer"),
    type: tag(b, "type"),
    salary: tag(b, "salary"),
    closeDate: tag(b, "closeDate"),
    postDate: tag(b, "postDate"),
    url: tag(b, "url"),
  }));
  return { vacancies: vacancies.filter((v) => v.reference && v.title), totalPages: Number(tag(xml, "totalPages")) || 0 };
}

/** Inner HTML of the element with this id, balancing nested tags of the same name. */
export function elementById(html: string, id: string): string | null {
  const open = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>`, "i").exec(html);
  if (!open) return null;
  const tagName = open[1].toLowerCase();
  const start = open.index + open[0].length;
  const re = new RegExp(`<(/?)${tagName}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start);
}

/** Sections that aren't about the job, or that hold personal data (recruiters' names and emails). */
const SKIPPED_SECTION = /cookie|contact|supporting documents|privacy|support links|employer (name|details|website)|^address$|reference number|date posted|job locations/i;

/**
 * The advert's sections as headed text, each once. Sponsorship notes can sit anywhere
 * (often "About us"), and the Person Specification holds the experience asked for, so
 * the whole advert is kept. The page repeats its details block for mobile.
 */
export function advertSections(html: string): { heading: string; text: string }[] {
  const parts = (elementById(html, "maincontent") ?? html).split(/(<h[23]\b[^>]*>[\s\S]*?<\/h[23]>)/i);
  const seen = new Set<string>();
  const sections: { heading: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const heading = htmlToText(parts[i]);
    const text = htmlToText(parts[i + 1]);
    const key = `${heading}\n${text}`;
    if (!heading || !text || SKIPPED_SECTION.test(heading) || seen.has(key)) continue;
    seen.add(key);
    sections.push({ heading, text });
  }
  return sections;
}

/** "Full-time", "Part-time", "Flexible working": in the paragraph after its heading, which has no id. */
const workingPatternOf = (html: string) => {
  const m = /<h3[^>]*\bid="working_pattern_heading"[^>]*>[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  return m ? htmlToText(m[1]) || null : null;
};

export function parseAdvert(html: string) {
  const text = (id: string) => {
    const inner = elementById(html, id);
    return inner === null ? null : htmlToText(inner) || null;
  };
  return {
    town: text("employer_town"),
    postcode: text("employer_postcode"),
    band: text("payscheme-band"),
    salary: text("range_salary") ?? text("fixed_salary") ?? text("negotiable_salary"),
    contractType: text("contract_type"),
    workingPattern: workingPatternOf(html),
    description: advertSections(html).map((s) => `${s.heading}\n${s.text}`).join("\n\n"),
  };
}

export type AdvertStatus = "open" | "closed" | "unknown";

/**
 * Whether an advert still takes applications. A closed advert still returns 200 and its text,
 * but says "This job is now closed" and has no Apply button. Adverts can drop out of our
 * search slices while still open, so a missing job is checked here before it's expired.
 */
export function advertStatus(status: number, html: string): AdvertStatus {
  if (status === 404 || status === 410) return "closed";
  if (status !== 200) return "unknown";
  if (/id="closing_date"[^>]*>[\s\S]{0,120}?this job is now closed/i.test(html)) return "closed";
  if (/<a\b[^>]*\bid="apply(-ats-direct)?"/i.test(html)) return "open";
  return "unknown";
}

export async function checkAdvert(reference: string): Promise<AdvertStatus> {
  const url = `${ADVERT}${reference}`;
  try {
    const { status, body } = await limited(url, () => requestText(url));
    return advertStatus(status, body ?? "");
  } catch {
    return "unknown";
  }
}

/** NHS Jobs is one shared board: each vacancy carries its own employer, matched to a sponsor later. */
export const nhsJobs: Adapter = async (_source, ctx) => {
  const vacancies = new Map<string, Vacancy>();
  for (const query of NHS_QUERIES) {
    for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
      const url = `${SEARCH}?${query}&page=${page}`;
      const { status, body } = await limited(url, () => requestText(url));
      if (status !== 200 || !body) throw new Error(`NHS Jobs search returned ${status}`);
      const { vacancies: batch, totalPages } = parseSearchXml(body);
      for (const v of batch) vacancies.set(v.reference, v);
      if (batch.length === 0 || page >= totalPages) break;
    }
  }

  const jobs: RawJob[] = [];
  for (const v of vacancies.values()) {
    const applyUrl = `${ADVERT}${v.reference}`;
    const base = {
      externalId: v.reference,
      title: v.title,
      applyUrl,
      employerName: v.employer || null,
      closingDate: /^\d{4}-\d{2}-\d{2}$/.test(v.closeDate) ? v.closeDate : null,
      postedAt: parseDate(v.postDate),
      employmentType: v.type || null,
    };
    if (ctx.knownIds.has(v.reference)) {
      jobs.push(emptyJob({ ...base, partial: true }));
      continue;
    }
    const { status, body } = await limited(applyUrl, () => requestText(applyUrl));
    if (status !== 200 || !body) {
      // Advert withdrawn between search and fetch, or a transient error: list fields only.
      jobs.push(emptyJob({ ...base, salaryText: v.salary || null }));
      continue;
    }
    const advert = parseAdvert(body);
    jobs.push(
      emptyJob({
        ...base,
        locationText: [advert.town, advert.postcode].filter(Boolean).join(", ") || null,
        salaryText: [advert.band, advert.salary ?? v.salary].filter(Boolean).join(" · ").replace(/\s+/g, " ").trim() || null,
        employmentType: [advert.contractType, advert.workingPattern].filter(Boolean).join(", ") || base.employmentType,
        description: capDescription(advert.description),
      }),
    );
  }
  return jobs;
};
