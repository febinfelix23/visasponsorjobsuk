import { spawn } from "node:child_process";
import { CsvParser } from "@/lib/csv";
import { collapseWhitespace } from "./normalise";
import { parseSicText, sectorFromSicCodes, sizeBandFromAccounts } from "./sectors";

/** Companies House "Free Company Data Product": every live company, refreshed monthly. */
export const CH_BULK_PAGE = "https://download.companieshouse.gov.uk/en_output.html";
const CH_BULK_BASE = "https://download.companieshouse.gov.uk/";

export type ChCompany = {
  name: string;
  number: string;
  postTown: string;
  status: string;
  sizeBand: number;
  sicCodes: string[];
};

/** Finds the latest month's multi-part zips (smaller files are easier to stream). */
export async function fetchBulkPartUrls(): Promise<{ date: string; urls: string[] }> {
  const res = await fetch(CH_BULK_PAGE);
  if (!res.ok) throw new Error(`Companies House download page returned ${res.status}`);
  const html = await res.text();
  const parts = [...html.matchAll(/BasicCompanyData-(\d{4}-\d{2}-\d{2})-part(\d+)_(\d+)\.zip/g)].map((m) => ({
    file: m[0],
    date: m[1],
    part: Number(m[2]),
    total: Number(m[3]),
  }));
  if (parts.length === 0) throw new Error("No bulk data parts found on the Companies House page");
  const date = parts.map((p) => p.date).sort().at(-1)!;
  const latest = [...new Map(parts.filter((p) => p.date === date).map((p) => [p.part, p])).values()].sort(
    (a, b) => a.part - b.part,
  );
  if (latest.length !== latest[0].total) {
    throw new Error(`Expected ${latest[0].total} parts for ${date}, found ${latest.length}`);
  }
  return { date, urls: latest.map((p) => CH_BULK_BASE + p.file) };
}

/** Streams companies out of one bulk zip via the system `unzip` (present on macOS and Ubuntu runners). */
export function streamCompaniesFromZip(zipPath: string, onCompany: (company: ChCompany) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const unzip = spawn("unzip", ["-p", zipPath], { stdio: ["ignore", "pipe", "pipe"] });
    let header: Map<string, number> | null = null;
    let count = 0;
    let stderr = "";

    const parser = new CsvParser((row) => {
      if (!header) {
        header = new Map(row.map((h, i) => [h.trim(), i]));
        for (const col of ["CompanyName", "CompanyNumber", "CompanyStatus", "SICCode.SicText_1"]) {
          if (!header.has(col)) {
            unzip.kill();
            reject(new Error(`Companies House file is missing column ${col}`));
          }
        }
        return;
      }
      const get = (col: string) => row[header!.get(col) ?? -1] ?? "";
      const sicCodes = [1, 2, 3, 4]
        .map((n) => parseSicText(get(`SICCode.SicText_${n}`)))
        .filter((c): c is string => c !== null);
      count++;
      onCompany({
        name: collapseWhitespace(get("CompanyName")),
        number: get("CompanyNumber").trim(),
        postTown: collapseWhitespace(get("RegAddress.PostTown")),
        status: get("CompanyStatus").trim(),
        sizeBand: sizeBandFromAccounts(get("Accounts.AccountCategory")),
        sicCodes,
      });
    });

    unzip.stdout.setEncoding("utf8");
    unzip.stdout.on("data", (chunk: string) => parser.push(chunk));
    unzip.stderr.on("data", (chunk) => (stderr += chunk));
    unzip.on("error", reject);
    unzip.on("close", (code) => {
      if (code !== 0) return reject(new Error(`unzip exited with ${code}: ${stderr.trim()}`));
      parser.end();
      resolve(count);
    });
  });
}

export type ChMatch = { company: ChCompany; confidence: number };

const sameTown = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Picks the Companies House record for a sponsor from companies sharing its
 * normalised name. The register's town is often a trading site rather than the
 * registered office, so a town mismatch lowers confidence but doesn't rule a match out.
 */
export function chooseMatch(sponsorTown: string, candidates: ChCompany[]): ChMatch | null {
  if (candidates.length === 0) return null;
  const active = candidates.filter((c) => c.status === "Active");
  const pool = active.length > 0 ? active : candidates;
  const penalty = active.length > 0 ? 0 : 0.2;

  if (pool.length === 1) {
    const company = pool[0];
    return { company, confidence: (sameTown(company.postTown, sponsorTown) ? 0.95 : 0.8) - penalty };
  }

  const inTown = pool.filter((c) => sameTown(c.postTown, sponsorTown));
  if (inTown.length === 1) return { company: inTown[0], confidence: 0.85 - penalty };

  // Still ambiguous: accept only if every candidate points to the same sector.
  const sectors = new Set(pool.map((c) => sectorFromSicCodes(c.sicCodes)));
  if (sectors.size === 1) {
    const largest = [...pool].sort((a, b) => b.sizeBand - a.sizeBand)[0];
    return { company: largest, confidence: 0.5 - penalty };
  }
  return null;
}
