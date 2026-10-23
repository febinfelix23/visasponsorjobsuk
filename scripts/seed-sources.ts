/**
 * Loads data/seeds/job-sources.json: job boards that slug probing can't find
 * (Workday tenants of large employers). Safe to re-run; existing rows are updated.
 *
 *   npm run seed:sources
 */
import "./load-env";

import { readFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { jobSources, sponsors } from "@/lib/db/schema";

type Seed = { sponsor: string; ats: "workday" | "greenhouse" | "lever" | "ashby" | "smartrecruiters"; identifier: string; ukOnly?: boolean };

const careersUrl = (seed: Seed) => {
  if (seed.ats !== "workday") return null;
  const [host, , site] = seed.identifier.split("/");
  return `https://${host}.myworkdayjobs.com/${site}`;
};

async function main() {
  const { sources } = JSON.parse(await readFile("data/seeds/job-sources.json", "utf8")) as { sources: Seed[] };
  const db = createDb(undefined, { max: 1 });
  try {
    let loaded = 0;
    for (const seed of sources) {
      const [sponsor] = await db
        .select({ id: sponsors.id })
        .from(sponsors)
        .where(and(eq(sponsors.name, seed.sponsor), eq(sponsors.status, "active")))
        .limit(1);
      if (!sponsor) {
        console.warn(`  ✗ No active sponsor named "${seed.sponsor}"; skipped ${seed.identifier}`);
        continue;
      }
      const discovery = { method: "seed", ...(seed.ukOnly ? { ukOnly: true } : {}) };
      await db
        .insert(jobSources)
        .values({ sponsorId: sponsor.id, ats: seed.ats, identifier: seed.identifier, careersUrl: careersUrl(seed), status: "active", discovery })
        .onConflictDoUpdate({
          target: [jobSources.ats, jobSources.identifier],
          set: { sponsorId: sponsor.id, careersUrl: careersUrl(seed), discovery, status: "active", updatedAt: sql`now()` },
        });
      loaded++;
    }
    console.log(`Loaded ${loaded} of ${sources.length} seed sources`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
