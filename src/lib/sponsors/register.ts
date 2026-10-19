import { collapseWhitespace, normaliseOrgName, registerKey, splitTradingName } from "./normalise";

export const REGISTER_CONTENT_API =
  "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";

export const SKILLED_WORKER_ROUTE = "Skilled Worker";

export type RegisterMetadata = { csvUrl: string; publishedOn: string };

/** Finds the current CSV attachment; its URL changes with every update, so never hard-code it. */
export async function fetchRegisterMetadata(): Promise<RegisterMetadata> {
  const res = await fetch(REGISTER_CONTENT_API, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`gov.uk Content API returned ${res.status}`);
  const body = (await res.json()) as {
    public_updated_at?: string;
    details?: { attachments?: { content_type?: string; url?: string }[] };
  };
  const csv = body.details?.attachments?.find((a) => a.content_type === "text/csv" && a.url);
  if (!csv?.url) throw new Error("No CSV attachment found on the register publication");
  if (!body.public_updated_at) throw new Error("Register publication has no public_updated_at");
  // public_updated_at is London local time, so its date part is the UK publication date.
  return { csvUrl: csv.url, publishedOn: body.public_updated_at.slice(0, 10) };
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, leading BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export type RegisterRow = {
  name: string;
  town: string;
  county: string;
  typeAndRating: string;
  route: string;
};

const EXPECTED_HEADER = ["Organisation Name", "Town/City", "County", "Type & Rating", "Route"];

export function parseRegisterCsv(text: string): RegisterRow[] {
  const [header, ...rows] = parseCsv(text);
  const cleanHeader = (header ?? []).map((h) => h.trim());
  if (EXPECTED_HEADER.some((h, i) => cleanHeader[i] !== h)) {
    throw new Error(`Unexpected register header: ${cleanHeader.join(", ")}`);
  }
  return rows.map(([name = "", town = "", county = "", typeAndRating = "", route = ""]) => ({
    name: collapseWhitespace(name),
    town: collapseWhitespace(town),
    county: collapseWhitespace(county),
    typeAndRating: collapseWhitespace(typeAndRating),
    route: collapseWhitespace(route),
  }));
}

/** "Worker (A rating)" → { type: "Worker", rating: "A" }; "Worker (A (Premium))" → "A (Premium)". */
export function parseTypeAndRating(value: string): { type: "Worker" | "Temporary Worker" | null; rating: string } {
  const match = /^(Temporary Worker|Worker)\s*\((.*)\)$/.exec(value);
  if (!match) return { type: null, rating: value };
  const rating = collapseWhitespace(match[2].replace(/\s*rating$/i, ""));
  return { type: match[1] as "Worker" | "Temporary Worker", rating };
}

export type SponsorRecord = {
  registerKey: string;
  name: string;
  nameNormalised: string;
  tradingName: string | null;
  town: string;
  county: string | null;
  workerRating: string | null;
  temporaryWorkerRating: string | null;
  routes: string[];
  isSkilledWorker: boolean;
};

/** The register has one row per sponsor per route; merge them into one record per name + town. */
export function groupSponsors(rows: RegisterRow[]): Map<string, SponsorRecord> {
  const sponsors = new Map<string, SponsorRecord>();
  for (const row of rows) {
    if (!row.name) continue;
    const key = registerKey(row.name, row.town);
    let record = sponsors.get(key);
    if (!record) {
      const { legalName, tradingName } = splitTradingName(row.name);
      record = {
        registerKey: key,
        name: row.name,
        nameNormalised: normaliseOrgName(legalName),
        tradingName,
        town: row.town,
        county: null,
        workerRating: null,
        temporaryWorkerRating: null,
        routes: [],
        isSkilledWorker: false,
      };
      sponsors.set(key, record);
    }
    record.county ??= row.county || null;
    const { type, rating } = parseTypeAndRating(row.typeAndRating);
    if (type === "Worker") record.workerRating ??= rating;
    if (type === "Temporary Worker") record.temporaryWorkerRating ??= rating;
    if (row.route && !record.routes.includes(row.route)) record.routes.push(row.route);
    if (row.route === SKILLED_WORKER_ROUTE) record.isSkilledWorker = true;
  }
  for (const record of sponsors.values()) record.routes.sort();
  return sponsors;
}
