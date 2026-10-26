import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobs, savedJobs } from "@/lib/db/schema";
import { type JobListItem, listColumns, toItem } from "@/lib/site/queries";
import { type ApplicationStatus, STATUSES } from "./statuses";

/**
 * Saved jobs and the application tracker. Like the rest of lib/account, the user ID comes
 * from the verified session, and every query matches on it.
 */

export { type ApplicationStatus, isStatus, STATUSES } from "./statuses";

/** Plenty for a real search; stops a script filling the table. */
export const MAX_SAVED = 500;

export async function savedJobIds(userId: string): Promise<number[]> {
  const rows = await getDb().select({ jobId: savedJobs.jobId }).from(savedJobs).where(eq(savedJobs.userId, userId));
  return rows.map((r) => r.jobId);
}

export class SavedLimitError extends Error {}

/** Saves or unsaves a job; returns whether it's saved afterwards. Unknown job IDs are ignored. */
export async function toggleSaved(userId: string, jobId: number): Promise<boolean> {
  const db = getDb();
  const removed = await db.delete(savedJobs).where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId))).returning({ jobId: savedJobs.jobId });
  if (removed.length > 0) return false;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(savedJobs).where(eq(savedJobs.userId, userId));
  if (n >= MAX_SAVED) throw new SavedLimitError(`You can save up to ${MAX_SAVED} jobs. Remove some to save more.`);
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return false;
  await db.insert(savedJobs).values({ userId, jobId }).onConflictDoNothing();
  return true;
}

export async function setStatus(userId: string, jobId: number, status: ApplicationStatus): Promise<void> {
  await getDb()
    .update(savedJobs)
    .set({ status, statusChangedAt: sql`now()` })
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)));
}

export async function removeSaved(userId: string, jobId: number): Promise<void> {
  await getDb().delete(savedJobs).where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)));
}

export type SavedJob = JobListItem & {
  status: ApplicationStatus;
  savedAt: string;
  statusChangedAt: string;
  /** The job has left the employer's board. */
  closed: boolean;
  /** Days until the closing date, judged when the query ran; null without one. */
  closesInDays: number | null;
};

export async function listSaved(userId: string): Promise<{ jobs: SavedJob[]; counts: Record<ApplicationStatus, number> }> {
  const rows = await getDb()
    .select({
      ...listColumns,
      status: savedJobs.status,
      savedAt: savedJobs.savedAt,
      statusChangedAt: savedJobs.statusChangedAt,
      jobStatus: jobs.status,
      // UK date, matching the listings: the database clock is UTC.
      closesInDays: sql<number | null>`(${jobs.closingDate} - (now() at time zone 'Europe/London')::date)`,
    })
    .from(savedJobs)
    .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .where(eq(savedJobs.userId, userId))
    // Open jobs closing soonest first, then the rest by when they were saved.
    .orderBy(sql`(${jobs.status} = 'live' and coalesce(${jobs.closingDate} >= (now() at time zone 'Europe/London')::date, true)) desc`, asc(jobs.closingDate), desc(savedJobs.savedAt));
  const counts = Object.fromEntries(STATUSES.map((s) => [s.value, 0])) as Record<ApplicationStatus, number>;
  const list = rows.map(({ status, savedAt, statusChangedAt, jobStatus, closesInDays, ...job }) => {
    counts[status]++;
    const closed = jobStatus !== "live" || (closesInDays !== null && closesInDays < 0);
    return { ...toItem(job), status, savedAt: savedAt.toISOString(), statusChangedAt: statusChangedAt.toISOString(), closed, closesInDays };
  });
  return { jobs: list, counts };
}
