import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDb(url = process.env.DATABASE_URL, options: { max?: number } = {}) {
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare: false — Supabase's transaction pooler doesn't support prepared statements.
  const client = postgres(url, { prepare: false, max: options.max ?? 5 });
  return drizzle({ client });
}

export type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { db?: Db };

/** Shared instance for the Next.js server; reused across hot reloads in dev. */
export function getDb(): Db {
  globalForDb.db ??= createDb();
  return globalForDb.db;
}
