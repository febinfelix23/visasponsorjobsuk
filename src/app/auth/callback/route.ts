import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";

/**
 * Google sends people back here with a one-time code; swapping it for a session sets the
 * auth cookies. Then on to `next`, which must be a path on this site.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // `origin` comes from the request the host received; a client-sent X-Forwarded-Host isn't trusted.
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback&next=${encodeURIComponent(next)}`);
}
