import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  // Only our tables; Supabase owns auth, storage and the rest.
  schemaFilter: ["public"],
  dbCredentials: {
    // Migrations need a session connection (Supabase direct or session pooler, port 5432).
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
