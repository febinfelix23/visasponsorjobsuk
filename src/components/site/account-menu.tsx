"use client";

import type { JwtPayload } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { isAdminClaims } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/client";

type Signed = { name: string; email: string; avatar: string | null; isAdmin: boolean };

const fromClaims = (c: JwtPayload | null | undefined): Signed | null => {
  if (!c?.sub) return null;
  const meta = (c.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { name: str(meta.full_name) || str(meta.name), email: str(c.email), avatar: str(meta.avatar_url) || str(meta.picture) || null, isAdmin: isAdminClaims(c) };
};

/**
 * Sign in, or the signed-in user's menu. Read in the browser so the public pages stay
 * prerendered; the admin link is only a convenience, the server checks every admin page.
 */
export function AccountMenu() {
  const pathname = usePathname();
  const [user, setUser] = useState<Signed | null | undefined>(undefined);
  const signOut = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getClaims().then(({ data }) => setUser(fromClaims(data?.claims)));
    const { data } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getClaims().then(({ data: d }) => setUser(fromClaims(d?.claims)));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Until the session is known, hold the space so the header doesn't jump.
  if (user === undefined) return <span aria-hidden className="inline-block size-9 sm:w-[4.5rem]" />;

  if (!user) {
    const next = pathname.startsWith("/auth") ? "/account" : pathname;
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(next)}`}
        // Phones reach sign-in from the menu panel ("Your account"), where there's room.
        className="hidden h-9 items-center rounded-md border border-white/30 px-3.5 text-[0.94rem] font-semibold whitespace-nowrap text-white hover:border-white/60 hover:bg-white/5 sm:inline-flex"
      >
        Sign in
      </Link>
    );
  }

  const initial = (user.name || user.email || "?").trim()[0]?.toUpperCase();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Your account" className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-teal-wash/60">
          <Avatar className="size-9 after:border-white/30">
            {user.avatar ? <AvatarImage src={user.avatar} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback className="bg-teal-wash text-sm font-bold text-teal">{initial}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 p-1.5 text-ink">
          {/* Who's signed in: plain text, not a menu label (Base UI labels must head a Menu.Group). */}
          <div className="px-2 py-1.5 text-sm">
            <span className="block truncate font-semibold text-ink">{user.name || "Your account"}</span>
            <span className="block truncate text-xs text-ink-soft">{user.email}</span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/account/jobs" />} className="px-2 py-2 text-[0.94rem]">
            Your jobs
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account" />} className="px-2 py-2 text-[0.94rem]">
            Your account
          </DropdownMenuItem>
          {user.isAdmin ? (
            <DropdownMenuItem render={<Link href="/admin" />} className="px-2 py-2 text-[0.94rem]">
              Posting helper
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut.current?.requestSubmit()} className="px-2 py-2 text-[0.94rem]">
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* POST, so another site can't sign anyone out with a link. */}
      <form ref={signOut} action="/auth/signout" method="post" hidden />
    </>
  );
}
