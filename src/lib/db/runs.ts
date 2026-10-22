import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from ".";
import { crawlRuns } from "./schema";

type RunKind = (typeof crawlRuns.$inferInsert)["kind"];

/** A run still "running" after this long was killed (timeout, cancelled job) without finishing. */
const STALE_AFTER_HOURS = 3;

/** Records a new run, first closing any earlier run of the same kind that died mid-way. */
export async function startRun(db: Db, kind: RunKind): Promise<number> {
  await db
    .update(crawlRuns)
    .set({ status: "failed", error: "Never finished (process killed or timed out)", finishedAt: sql`now()` })
    .where(
      and(
        eq(crawlRuns.kind, kind),
        eq(crawlRuns.status, "running"),
        lt(crawlRuns.startedAt, sql`now() - make_interval(hours => ${STALE_AFTER_HOURS})`),
      ),
    );
  const [run] = await db.insert(crawlRuns).values({ kind }).returning({ id: crawlRuns.id });
  return run.id;
}
