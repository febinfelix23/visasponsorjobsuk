/**
 * Builds src/lib/scoring/skilled-occupations.json from the Immigration Rules
 * Appendix Skilled Occupations on gov.uk (Open Government Licence v3.0).
 * Re-run whenever the rules change:  npm run build:occupations
 */
import { writeFile } from "node:fs/promises";

const CONTENT_API = "https://www.gov.uk/api/content/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations";
const OUT = "src/lib/scoring/skilled-occupations.json";

/** How the Skilled Worker route treats an occupation, from which appendix table lists it. */
type Eligibility = "eligible" | "limited" | "national_pay_scale" | "ineligible";

const TABLES: { caption: RegExp; eligibility: Eligibility }[] = [
  { caption: /^Table 1:/, eligibility: "eligible" },
  { caption: /^Table 1a:/, eligibility: "limited" },
  { caption: /^Table 3:/, eligibility: "national_pay_scale" },
  { caption: /^Table 3a:/, eligibility: "national_pay_scale" },
  { caption: /^Table 6:/, eligibility: "ineligible" },
];

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const money = (cell: string | undefined) => {
  const m = /£([\d,]+)/.exec(cell ?? "");
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

async function main() {
  const res = await fetch(CONTENT_API, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`gov.uk returned ${res.status}`);
  const content = (await res.json()) as { public_updated_at: string; details: { body: string } };
  const body = content.details.body;

  const occupations: Record<string, { title: string; eligibility: Eligibility; goingRate: number | null; newEntrantRate: number | null; exampleTitles: string[] }> = {};
  const parts = body.split(/(<table[\s\S]*?<\/table>)/);
  let caption = "";
  for (const part of parts) {
    if (!part.startsWith("<table")) {
      const heads = [...part.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/g)];
      if (heads.length) caption = decode(heads.at(-1)![1]);
      continue;
    }
    const table = TABLES.find((t) => t.caption.test(caption));
    if (!table) continue;
    const rows = [...part.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1]));
    const header = rows[0].map(decode);
    const col = (pattern: RegExp) => header.findIndex((h) => pattern.test(h));
    const examplesCol = col(/Examples of related job titles/i);
    const goingCol = col(/^Going rate/i);
    const seventyCol = col(/^70% of going rate/i);

    for (const row of rows.slice(1)) {
      const first = decode(row[0] ?? "");
      const m = /^(\d{4})\s+(.+)$/.exec(first);
      if (!m) continue;
      const [, soc, title] = m;
      // An occupation can appear in more than one table; the first (most favourable) listing wins.
      if (occupations[soc]) continue;
      const examples = (row[examplesCol] ?? "")
        .split(/<li[^>]*>|•/)
        .map(decode)
        .filter((t) => t && t.length < 80);
      occupations[soc] = {
        title,
        eligibility: table.eligibility,
        goingRate: goingCol >= 0 ? money(row[goingCol]) : null,
        newEntrantRate: seventyCol >= 0 ? money(row[seventyCol]) : null,
        exampleTitles: examples,
      };
    }
  }

  const count = Object.keys(occupations).length;
  if (count < 300) throw new Error(`Only parsed ${count} occupations; the page layout may have changed`);
  await writeFile(
    OUT,
    JSON.stringify(
      {
        source: "https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-occupations",
        licence: "Open Government Licence v3.0",
        sourceUpdatedAt: content.public_updated_at,
        occupations,
      },
      null,
      1,
    ) + "\n",
  );
  const byEligibility = Object.values(occupations).reduce<Record<string, number>>((acc, o) => ((acc[o.eligibility] = (acc[o.eligibility] ?? 0) + 1), acc), {});
  console.log(`Wrote ${count} occupations (rules updated ${content.public_updated_at})`, byEligibility);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
