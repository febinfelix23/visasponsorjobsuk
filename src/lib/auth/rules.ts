import type { JwtPayload } from "@supabase/supabase-js";

/**
 * Admin is `app_metadata.role = "admin"` on the account. Only the service role (or SQL)
 * can write app_metadata, so a user can't make themselves an admin, unlike user_metadata.
 */
export const isAdminClaims = (claims: JwtPayload | null | undefined): boolean => claims?.app_metadata?.role === "admin";

export const ADMIN_HOME = "/admin";
/** Where people land after signing in when no page was asked for. */
export const ACCOUNT_HOME = "/account";

/**
 * Where to send someone after signing in. Only a path on this site: "//evil.example" and
 * "/\evil.example" are other sites to a browser, so they fall back to the account page.
 */
export function safeNext(value: string | null | undefined, fallback = ACCOUNT_HOME): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, "https://placeholder.invalid");
    return url.origin === "https://placeholder.invalid" ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}
