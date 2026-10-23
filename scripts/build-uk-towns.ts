/**
 * Builds src/lib/geo/uk-towns.json, the UK place gazetteer used to recognise job
 * locations, from the towns on the sponsor register (every licensed employer's
 * town is a real UK place). Re-run occasionally: npm run build:uk-towns
 */
import "./load-env";

import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/db";

const MIN_SPONSORS = 2;
// Register typos and foreign head offices that would make bad gazetteer entries.
const EXCLUDE = new Set(["", "uk", "united kingdom", "england", "remote", "various", "n/a", "na", "-", "dubai", "paris", "new york", "dublin", "mumbai", "delhi", "lagos", "singapore", "hong kong"]);

async function main() {
  const db = createDb(undefined, { max: 1 });
  try {
    const rows = await db.execute<{ town: string }>(sql`
      select lower(trim(town)) as town from sponsors
      group by 1 having count(*) >= ${MIN_SPONSORS} and length(lower(trim(town))) >= 3
      order by 1`);
    const towns = rows.map((r) => r.town.replace(/\s+/g, " ")).filter((t) => !EXCLUDE.has(t) && /^[a-z' .&-]+$/.test(t));
    await writeFile("src/lib/geo/uk-towns.json", JSON.stringify(towns) + "\n");
    console.log(`Wrote ${towns.length} towns`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
