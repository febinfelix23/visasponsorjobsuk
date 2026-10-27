import { BADGE, formatSalary, shortLocation } from "@/components/site/format";
import { FIELD_KEYS, FIELD_LABEL } from "@/lib/scoring/fields";
import type { JobListItem } from "@/lib/site/queries";
import { shortJobPath } from "@/lib/site/short-link";

/**
 * Copy-ready posts for the channels the founder posts to by hand. Jobs arrive ranked
 * best first; everything here is plain text so it can be tested and edited before posting.
 */

export type FieldGroup = { field: string; label: string; jobs: JobListItem[] };
export type PostOptions = { siteUrl: string; date: Date };

export const TELEGRAM_LIMIT = 4096;
const DISCLAIMER = "Facts from the sponsor register, the job ad and the Skilled Worker rules, not immigration advice. Confirm sponsorship with the employer before you apply.";

/** A job's short link (/j/<code>), about 40 characters, so posts stay readable and fit more jobs. */
export const jobLink = (siteUrl: string, job: Pick<JobListItem, "id">) => new URL(shortJobPath(job.id), siteUrl).toString();
const siteLink = (siteUrl: string, path: string) => new URL(path, siteUrl).toString();

export const londonDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" });
export const isoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/**
 * Top jobs per field, in the registry's order. One job per employer per field, and one
 * per title, so a bank's ten identical graduate listings don't fill a section.
 */
export function pickTop(ranked: JobListItem[], perField: number): FieldGroup[] {
  const groups: FieldGroup[] = [];
  for (const field of FIELD_KEYS) {
    if (field === "other") continue;
    const employers = new Set<string>();
    const titles = new Set<string>();
    const jobs: JobListItem[] = [];
    for (const job of ranked) {
      if (job.field !== field || jobs.length >= perField) continue;
      const employer = job.employerName.toLowerCase();
      const title = job.title.toLowerCase().replace(/\s+/g, " ").trim();
      if (employers.has(employer) || titles.has(title)) continue;
      employers.add(employer);
      titles.add(title);
      jobs.push(job);
    }
    if (jobs.length > 0) groups.push({ field, label: FIELD_LABEL[field], jobs });
  }
  return groups;
}

/**
 * How many jobs each post carries, whatever the day's haul: a steady amount per post
 * keeps every channel supplied without spending the whole pool at once.
 */
export const POST_SIZE = { telegram: 10, whatsapp: 6, instagram: 9, reddit: 20 } as const;

/** Each field's best job first, then each field's second, and so on, up to `max`. */
export function spreadAcrossFields(groups: FieldGroup[], max: number): JobListItem[] {
  const out: JobListItem[] = [];
  for (let round = 0; out.length < max; round++) {
    const next = groups.flatMap((g) => (g.jobs[round] ? [g.jobs[round]] : []));
    if (next.length === 0) break;
    out.push(...next.slice(0, max - out.length));
  }
  return out;
}

/** A post's jobs: `count` of the ranked candidates, spread across fields. Fewer only if the pool is smaller. */
export function selectForPost(ranked: JobListItem[], count: number): JobListItem[] {
  return spreadAcrossFields(pickTop(ranked, count), count);
}

/** Selected jobs back into field sections, in the registry's order. */
export function groupByField(jobs: JobListItem[]): FieldGroup[] {
  return FIELD_KEYS.flatMap((field) => {
    const inField = jobs.filter((j) => j.field === field);
    return inField.length > 0 ? [{ field, label: FIELD_LABEL[field], jobs: inField }] : [];
  });
}

function facts(job: JobListItem): string {
  const salary = formatSalary(job.salaryAnnualMin, job.salaryAnnualMax);
  return [salary ? `${salary} a year` : null, job.isGradScheme ? "Graduate scheme" : null, BADGE[job.sponsorability].label].filter(Boolean).join(". ");
}

const where = (job: JobListItem) => {
  const place = shortLocation(job.locationText);
  return place ? `${job.employerName}, ${place}` : job.employerName;
};
const total = (groups: FieldGroup[]) => groups.reduce((n, g) => n + g.jobs.length, 0);
const roles = (n: number) => `${n} ${n === 1 ? "role" : "roles"}`;

/** Drops the lowest-ranked job from the biggest section (the later one on a tie) until the post fits. */
function fit(groups: FieldGroup[], render: (g: FieldGroup[]) => string, limit: number): string {
  let current = groups.map((g) => ({ ...g, jobs: [...g.jobs] }));
  let text = render(current);
  while (text.length > limit && total(current) > 1) {
    const biggest = current.reduce((a, b) => (b.jobs.length >= a.jobs.length ? b : a));
    biggest.jobs.pop();
    current = current.filter((g) => g.jobs.length > 0);
    text = render(current);
  }
  return text;
}

/** Telegram: its apps turn **text** into bold when the post is sent. */
export function telegramPost(groups: FieldGroup[], o: PostOptions): string {
  const render = (gs: FieldGroup[]) =>
    [
      `**Graduate jobs at UK visa sponsors: ${londonDate(o.date)}**`,
      `${roles(total(gs))} just added at employers licensed to sponsor Skilled Worker visas, each checked against the salary and occupation rules.`,
      ...gs.map((g) =>
        [`**${g.label}**`, ...g.jobs.map((j) => `• ${j.title}\n${where(j)}\n${facts(j)}\n${jobLink(o.siteUrl, j)}`)].join("\n\n"),
      ),
      `More jobs: ${siteLink(o.siteUrl, "/")}`,
      DISCLAIMER,
    ].join("\n\n");
  return fit(groups, render, TELEGRAM_LIMIT);
}

/** WhatsApp channel digest: WhatsApp's bold is *text*. Kept shorter than Telegram's. */
export function whatsappDigest(groups: FieldGroup[], o: PostOptions): string {
  const render = (gs: FieldGroup[]) =>
    [
      `*Graduate jobs at UK visa sponsors: ${londonDate(o.date)}*`,
      ...gs.map((g) =>
        [`*${g.label}*`, ...g.jobs.map((j) => `${j.title}, ${where(j)}\n${facts(j)}\n${jobLink(o.siteUrl, j)}`)].join("\n\n"),
      ),
      `All jobs: ${siteLink(o.siteUrl, "/")}`,
      `_${DISCLAIMER}_`,
    ].join("\n\n");
  return fit(groups, render, 3500);
}

const md = (s: string) => s.replace(/([\\[\]*_`|>~])/g, "\\$1");

/** Reddit weekly roundup in Markdown. Post it only where a subreddit's rules allow roundups. */
export function redditRoundup(groups: FieldGroup[], o: PostOptions): { title: string; body: string } {
  const title = `Graduate jobs at UK licensed visa sponsors, week of ${londonDate(o.date)}`;
  const body = [
    `${roles(total(groups))} for graduates and early-career applicants from the past week at employers on the Home Office Register of Licensed Sponsors. Each one is checked against the Skilled Worker rules for people switching from a Student or Graduate visa: the sponsor licence, the occupation code and the new-entrant salary.`,
    ...groups.map((g) =>
      [`## ${md(g.label)}`, ...g.jobs.map((j) => `- [${md(j.title)}](${jobLink(o.siteUrl, j)}), ${md(where(j))}. ${md(facts(j))}.`)].join("\n\n"),
    ),
    `How the checks work: ${siteLink(o.siteUrl, "/how-we-check")}`,
    `*${DISCLAIMER}*`,
  ].join("\n\n");
  return { title, body };
}

/** Instagram caption: links aren't clickable there, so it points to the link in the bio. */
export function instagramCaption(jobs: JobListItem[], o: PostOptions): string {
  return [
    `Graduate jobs at UK visa sponsors, ${londonDate(o.date)}.`,
    jobs.map((j, i) => `${i + 1}. ${j.title}, ${j.employerName}`).join("\n"),
    "Each job's full sponsorship check and the apply link are on our site. Link in bio.",
    DISCLAIMER,
    "#skilledworkervisa #graduatevisa #ukjobs #visasponsorship #graduatejobs",
  ].join("\n\n");
}
