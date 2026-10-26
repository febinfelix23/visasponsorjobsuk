import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminClaims } from "./rules";

export type SessionUser = { id: string; email: string | null; name: string | null; avatarUrl: string | null; isAdmin: boolean };

/**
 * The signed-in user from the verified session (getClaims checks the JWT signature), or
 * null. Every account page and action takes the user's ID from here, never from a form.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { data, error } = await (await createClient()).auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id: claims.sub,
    email: str(claims.email),
    name: str(meta.full_name) ?? str(meta.name),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
    isAdmin: isAdminClaims(claims),
  };
}

/** For account pages: the user, or off to sign in and back here afterwards. */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}
