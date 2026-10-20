/**
 * Tags every active sponsor with a sector, a Companies House match and a crawl
 * priority, using the free monthly Companies House bulk data (about 450 MB of zips).
 *
 *   npm run tag:sectors                    # download the latest parts, tag, write
 *   npm run tag:sectors -- --dry-run       # tag and print stats, write nothing
 *   npm run tag:sectors -- --dir ./ch      # use zips already downloaded to ./ch (kept afterwards)
 *   npm run tag:sectors -- --dry-run --out tags.json   # also save every sponsor's tags for review
 */
import "./load-env";

import { createWriteStream } from "node:fs";
import { appendFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { crawlRuns, sponsors } from "@/lib/db/schema";
import { chooseMatch, fetchBulkPartUrls, streamCompaniesFromZip, type ChCompany } from "@/lib/sponsors/companies-house";
import { normaliseOrgName, splitTradingName } from "@/lib/sponsors/normalise";
import { tagSponsor, type SponsorTags } from "@/lib/sponsors/tagging";

const BATCH_SIZE = 5000;

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    dir: { type: "string" },
    out: { type: "string" },
  },
});

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download of ${url} returned ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(dest));
}

async function* bulkZips(): AsyncGenerator<string> {
  if (args.dir) {
    const files = (await readdir(args.dir)).filter((f) => /^BasicCompanyData-.*\.zip$/.test(f)).sort();
    if (files.length === 0) throw new Error(`No BasicCompanyData-*.zip files in ${args.dir}`);
    for (const f of files) yield join(args.dir, f);
    return;
  }
  const { date, urls } = await fetchBulkPartUrls();
  console.log(`Companies House bulk data ${date}: ${urls.length} parts`);
  const dir = await mkdtemp(join(tmpdir(), "ch-bulk-"));
  try {
    for (const url of urls) {
      const dest = join(dir, url.split("/").at(-1)!);
      await download(url, dest);
      yield dest;
      await rm(dest, { force: true }); // one part on disk at a time
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

async function main() {
  const db = createDb(undefined, { max: 1 });
  const [run] = await db.insert(crawlRuns).values({ kind: "sector_tagging" }).returning({ id: crawlRuns.id });
  const finish = (status: "succeeded" | "failed", stats: Record<string, unknown>, error?: string) =>
    db.update(crawlRuns).set({ status, stats, error, finishedAt: new Date() }).where(eq(crawlRuns.id, run.id));

  try {
    const active = await db
      .select({
        id: sponsors.id,
        name: sponsors.name,
        town: sponsors.town,
        isSkilledWorker: sponsors.isSkilledWorker,
        workerRating: sponsors.workerRating,
        sectorSource: sponsors.sectorSource,
      })
      .from(sponsors)
      .where(eq(sponsors.status, "active"));
    // Recomputed rather than read from the table, so normalisation changes apply without a re-ingest.
    const toTag = active
      .filter((s) => s.sectorSource !== "manual")
      .map((s) => ({ ...s, nameNormalised: normaliseOrgName(splitTradingName(s.name).legalName) }));
    console.log(`${toTag.length} active sponsors to tag (${active.length - toTag.length} manual, skipped)`);

    // Only companies whose normalised name belongs to a sponsor are kept in memory.
    const candidates = new Map<string, ChCompany[]>(toTag.map((s) => [s.nameNormalised, []]));
    let companiesScanned = 0;
    for await (const zip of bulkZips()) {
      const started = Date.now();
      const n = await streamCompaniesFromZip(zip, (company) => {
        candidates.get(normaliseOrgName(company.name))?.push(company);
      });
      companiesScanned += n;
      console.log(`  ${zip.split("/").at(-1)}: ${n.toLocaleString()} companies in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    if (companiesScanned < 1_000_000) {
      throw new Error(`Only ${companiesScanned} companies scanned; the bulk data looks incomplete`);
    }

    const tags: SponsorTags[] = toTag.map((s) =>
      tagSponsor(s, chooseMatch(s.town, candidates.get(s.nameNormalised) ?? [])),
    );
    const normalisedById = new Map(toTag.map((s) => [s.id, s.nameNormalised]));

    const inScope = tags.filter((t) => t.inScope);
    const stats = {
      companiesScanned,
      sponsorsTagged: tags.length,
      matchedToCompaniesHouse: tags.filter((t) => t.companyNumber).length,
      bySource: countBy(tags, (t) => t.sectorSource ?? "none"),
      bySector: countBy(tags, (t) => t.sector ?? "unknown"),
      inScope: inScope.length,
      inScopeBySector: countBy(inScope, (t) => t.sector!),
      inScopeBySizeBand: countBy(inScope, (t) => String(t.sizeBand)),
      dryRun: args["dry-run"],
    };
    console.log(JSON.stringify(stats, null, 2));
    if (args.out) {
      const byId = new Map(toTag.map((s) => [s.id, s]));
      const rows = tags.map((t) => ({ name: byId.get(t.id)!.name, town: byId.get(t.id)!.town, ...t }));
      await writeFile(args.out, JSON.stringify(rows));
      console.log(`Saved tags to ${args.out}`);
    }

    if (!args["dry-run"]) {
      const client = db.$client;
      await client.begin(async (tx) => {
        for (let i = 0; i < tags.length; i += BATCH_SIZE) {
          const batch = tags.slice(i, i + BATCH_SIZE);
          // One UPDATE … FROM unnest() per batch instead of 5,000 single-row updates.
          await tx`
            update sponsors s set
              name_normalised = v.name_normalised,
              sector = v.sector::sector,
              sector_source = v.sector_source::sector_source,
              in_scope = v.in_scope,
              sic_codes = case when v.sic_codes = '' then null else string_to_array(v.sic_codes, ',') end,
              company_number = v.company_number,
              match_confidence = v.match_confidence,
              size_band = v.size_band,
              priority_score = v.priority_score,
              updated_at = now()
            from unnest(
              ${tx.array(batch.map((t) => t.id))}::bigint[],
              ${tx.array(batch.map((t) => normalisedById.get(t.id)!))}::text[],
              ${tx.array(batch.map((t) => t.sector))}::text[],
              ${tx.array(batch.map((t) => t.sectorSource))}::text[],
              ${tx.array(batch.map((t) => String(t.inScope)))}::boolean[],
              ${tx.array(batch.map((t) => t.sicCodes?.join(",") ?? ""))}::text[],
              ${tx.array(batch.map((t) => t.companyNumber))}::text[],
              ${tx.array(batch.map((t) => t.matchConfidence))}::real[],
              ${tx.array(batch.map((t) => t.sizeBand))}::smallint[],
              ${tx.array(batch.map((t) => t.priorityScore))}::real[]
            ) as v(id, name_normalised, sector, sector_source, in_scope, sic_codes, company_number, match_confidence, size_band, priority_score)
            where s.id = v.id and s.sector_source is distinct from 'manual'
          `;
        }
      });
      console.log(`Wrote tags for ${tags.length} sponsors.`);
    }

    await finish("succeeded", stats);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### Sector tagging\n\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\`\n`,
      );
    }
  } catch (error) {
    await finish("failed", {}, error instanceof Error ? error.message : String(error)).catch(() => {});
    throw error;
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
