import { sql } from "drizzle-orm";
import { jobs } from "@/lib/db/schema";

/**
 * Fingerprint of everything the reader sees for a job (its fields and the whole ad). A job
 * needs reading when no reading carries its current fingerprint: new, or its text changed.
 */
export const jobTextHash = sql<string>`md5(concat_ws(chr(10), ${jobs.title}, ${jobs.employerName}, ${jobs.employmentType}, ${jobs.salaryText}, ${jobs.closingDate}::text, ${jobs.description}))`;
