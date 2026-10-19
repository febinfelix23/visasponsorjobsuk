/**
 * Downloads the gov.uk Register of Licensed Sponsors, diffs it against the
 * database and records additions, removals and rating/route changes.
 *
 *   npm run ingest:register                 # normal run (skips if the file is unchanged)
 *   npm run ingest:register -- --dry-run    # do everything, then roll back
 *   npm run ingest:register -- --force      # re-process even if this file was already ingested
 *   npm run ingest:register -- --file reg.csv
 *   npm run ingest:register -- --allow-mass-removal
 */
import "./load-env";

import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { eq, inArray, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { crawlRuns, registerSnapshots, sponsorEvents, sponsors } from "@/lib/db/schema";
import { diffRegister, type ExistingSponsor } from "@/lib/sponsors/diff";
import { fetchRegisterMetadata, groupSponsors, parseRegisterCsv } from "@/lib/sponsors/register";

const BATCH_SIZE = 1000;
// The real register has ~140k rows. Far fewer means a truncated or broken download.
const MIN_ROWS = 50_000;
// Sponsors removed in one day are normally a handful. More than this is treated as a bad file.
const MAX_REMOVAL_FRACTION = 0.05;
// Arbitrary constant so two ingests never run at once.
const ADVISORY_LOCK_KEY = 727_001;

class DryRunRollback extends Error {}

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    file: { type: "string" },
    "allow-mass-removal": { type: "boolean", default: false },
  },
});

function chunk<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadRegister() {
  if (args.file) {
    return {
      csvUrl: `file:${args.file}`,
      publishedOn: new Date().toISOString().slice(0, 10),
      text: await readFile(args.file, "utf8"),
    };
  }
  const meta = await fetchRegisterMetadata();
  const res = await fetch(meta.csvUrl);
  if (!res.ok) throw new Error(`Register CSV download returned ${res.status}`);
  return { ...meta, text: await res.text() };
}

async function main() {
  const db = createDb(undefined, { max: 1 });
  const [run] = await db.insert(crawlRuns).values({ kind: "register_ingest" }).returning({ id: crawlRuns.id });
  const finish = (status: "succeeded" | "failed" | "skipped", stats: Record<string, unknown>, error?: string) =>
    db
      .update(crawlRuns)
      .set({ status, stats, error, finishedAt: new Date() })
      .where(eq(crawlRuns.id, run.id));

  try {
    const register = await loadRegister();
    const fileHash = createHash("sha256").update(register.text).digest("hex");
    console.log(`Register published ${register.publishedOn}: ${register.csvUrl}`);

    if (!args.force) {
      const [seen] = await db
        .select({ id: registerSnapshots.id })
        .from(registerSnapshots)
        .where(eq(registerSnapshots.fileHash, fileHash));
      if (seen) {
        console.log("This file has already been ingested. Nothing to do.");
        await finish("skipped", { reason: "unchanged", fileHash });
        return;
      }
    }

    const rows = parseRegisterCsv(register.text);
    if (rows.length < MIN_ROWS) throw new Error(`Register has only ${rows.length} rows; refusing to ingest`);
    const incoming = groupSponsors(rows);

    let stats: Record<string, unknown> = {};
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`);

        const existing: ExistingSponsor[] = await tx
          .select({
            id: sponsors.id,
            registerKey: sponsors.registerKey,
            status: sponsors.status,
            name: sponsors.name,
            county: sponsors.county,
            workerRating: sponsors.workerRating,
            temporaryWorkerRating: sponsors.temporaryWorkerRating,
            routes: sponsors.routes,
          })
          .from(sponsors);
        const isFirstIngest = existing.length === 0;

        const diff = diffRegister(existing, incoming);
        const activeCount = existing.filter((s) => s.status === "active").length;
        if (
          !args["allow-mass-removal"] &&
          activeCount > 1000 &&
          diff.removed.length > activeCount * MAX_REMOVAL_FRACTION
        ) {
          throw new Error(
            `${diff.removed.length} of ${activeCount} sponsors would be removed. ` +
              "Check the file, then re-run with --allow-mass-removal if it is genuine.",
          );
        }

        const [snapshot] = await tx
          .insert(registerSnapshots)
          .values({
            fileUrl: register.csvUrl,
            fileHash,
            publishedOn: register.publishedOn,
            rowCount: rows.length,
            sponsorCount: incoming.size,
            addedCount: diff.addedCount,
            removedCount: diff.removed.length,
            changedCount: diff.changedCount,
          })
          .onConflictDoUpdate({
            target: registerSnapshots.fileHash,
            set: { ingestedAt: sql`now()` },
          })
          .returning({ id: registerSnapshots.id });

        const idByKey = new Map<string, number>();
        for (const batch of chunk(diff.upserts)) {
          const written = await tx
            .insert(sponsors)
            .values(
              batch.map((r) => ({
                ...r,
                status: "active" as const,
                firstSeenOn: register.publishedOn,
              })),
            )
            .onConflictDoUpdate({
              target: sponsors.registerKey,
              set: {
                name: sql`excluded.name`,
                nameNormalised: sql`excluded.name_normalised`,
                tradingName: sql`excluded.trading_name`,
                county: sql`excluded.county`,
                workerRating: sql`excluded.worker_rating`,
                temporaryWorkerRating: sql`excluded.temporary_worker_rating`,
                routes: sql`excluded.routes`,
                isSkilledWorker: sql`excluded.is_skilled_worker`,
                status: "active",
                removedOn: null,
                updatedAt: sql`now()`,
              },
            })
            .returning({ id: sponsors.id, registerKey: sponsors.registerKey });
          for (const w of written) idByKey.set(w.registerKey, w.id);
        }

        for (const batch of chunk(diff.removed)) {
          await tx
            .update(sponsors)
            .set({ status: "removed", removedOn: register.publishedOn })
            .where(
              inArray(
                sponsors.id,
                batch.map((s) => s.id),
              ),
            );
          for (const s of batch) idByKey.set(s.registerKey, s.id);
        }

        // The first ingest would log ~125k "added" events, so it records none.
        const events = isFirstIngest ? [] : diff.events;
        for (const batch of chunk(events)) {
          await tx.insert(sponsorEvents).values(
            batch.map((e) => ({
              sponsorId: idByKey.get(e.registerKey)!,
              snapshotId: snapshot.id,
              type: e.type,
              details: e.details,
            })),
          );
        }

        stats = {
          publishedOn: register.publishedOn,
          fileHash,
          rows: rows.length,
          sponsors: incoming.size,
          skilledWorkerSponsors: [...incoming.values()].filter((s) => s.isSkilledWorker).length,
          added: diff.addedCount,
          changed: diff.changedCount,
          removed: diff.removed.length,
          events: events.length,
          firstIngest: isFirstIngest,
          dryRun: args["dry-run"],
        };

        if (args["dry-run"]) throw new DryRunRollback();
      });
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
      console.log("Dry run: all changes rolled back.");
    }

    console.log(JSON.stringify(stats, null, 2));
    await finish("succeeded", stats);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### Sponsor register ingest\n\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\`\n`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish("failed", {}, message).catch(() => {});
    throw error;
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
