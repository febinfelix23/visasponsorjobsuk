import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Sign out (POST only, so a link or image on another site can't sign anyone out). */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303: the browser follows with a GET.
  return NextResponse.redirect(new URL("/", request.url), 303);
}
