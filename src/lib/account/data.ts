import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userEducation, userExperience, userProfiles } from "@/lib/db/schema";
import { type EducationInput, type ExperienceInput, MAX_EDUCATION, MAX_EXPERIENCE, type PreferencesInput } from "@/lib/profile/validate";

/**
 * A job seeker's own data. Callers pass the user ID from the verified session
 * (lib/auth/session); every update and delete also matches on it, so an entry ID taken
 * from a form can only ever reach the signed-in user's own rows.
 */

export type Preferences = typeof userProfiles.$inferSelect;
export type Education = typeof userEducation.$inferSelect;
export type Experience = typeof userExperience.$inferSelect;

export async function getAccount(userId: string): Promise<{ preferences: Preferences | null; education: Education[]; experience: Experience[] }> {
  const db = getDb();
  const [[preferences], education, experience] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
    db.select().from(userEducation).where(eq(userEducation.userId, userId)).orderBy(desc(userEducation.graduationYear), desc(userEducation.id)),
    db
      .select()
      .from(userExperience)
      .where(eq(userExperience.userId, userId))
      // Current roles first, then most recent.
      .orderBy(sql`${userExperience.endedOn} desc nulls first`, sql`${userExperience.startedOn} desc nulls last`, desc(userExperience.id)),
  ]);
  return { preferences: preferences ?? null, education, experience };
}

export class LimitReachedError extends Error {}

const count = async (table: typeof userEducation | typeof userExperience, userId: string) =>
  (await getDb().select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.userId, userId)))[0].n;

/** Adds (id null) or updates an entry. Returns false when the ID isn't one of this user's entries. */
export async function saveEducation(userId: string, id: number | null, input: EducationInput): Promise<boolean> {
  const db = getDb();
  if (id === null) {
    if ((await count(userEducation, userId)) >= MAX_EDUCATION) throw new LimitReachedError(`You can add up to ${MAX_EDUCATION} degrees.`);
    await db.insert(userEducation).values({ userId, ...input });
    return true;
  }
  const rows = await db.update(userEducation).set(input).where(and(eq(userEducation.id, id), eq(userEducation.userId, userId))).returning({ id: userEducation.id });
  return rows.length === 1;
}

export async function deleteEducation(userId: string, id: number): Promise<void> {
  await getDb().delete(userEducation).where(and(eq(userEducation.id, id), eq(userEducation.userId, userId)));
}

export async function saveExperience(userId: string, id: number | null, input: ExperienceInput): Promise<boolean> {
  const db = getDb();
  // A changed title gets classified again (step D), so clear the old occupation code.
  const fields = { ...input, socCode: null };
  if (id === null) {
    if ((await count(userExperience, userId)) >= MAX_EXPERIENCE) throw new LimitReachedError(`You can add up to ${MAX_EXPERIENCE} entries.`);
    await db.insert(userExperience).values({ userId, ...fields });
    return true;
  }
  const rows = await db.update(userExperience).set(fields).where(and(eq(userExperience.id, id), eq(userExperience.userId, userId))).returning({ id: userExperience.id });
  return rows.length === 1;
}

export async function deleteExperience(userId: string, id: number): Promise<void> {
  await getDb().delete(userExperience).where(and(eq(userExperience.id, id), eq(userExperience.userId, userId)));
}

export async function savePreferences(userId: string, input: PreferencesInput): Promise<void> {
  await getDb()
    .insert(userProfiles)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { ...input, updatedAt: sql`now()` } });
}

/**
 * Deletes the account. Removing the Supabase Auth user cascades to every table that
 * references it (preferences, education, experience, and later saved jobs and alerts).
 */
export async function deleteAccount(userId: string): Promise<void> {
  await getDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
}
