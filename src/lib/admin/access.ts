import { isAdminClaims } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";

/**
 * Who may use /admin and its card images. The proxy turns non-admins away first; every
 * admin page and route checks again here, where the data is read.
 *
 * getClaims() verifies the session's JWT signature, so a forged or expired cookie fails.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  return !error && isAdminClaims(data?.claims);
}
