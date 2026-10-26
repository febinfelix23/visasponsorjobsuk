import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { Guilloche } from "@/components/site/guilloche";
import { isAdminClaims, safeNext } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";
import { Page } from "@/components/site/container";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function SignIn({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const next = safeNext(one(sp.next));
  const { data } = await (await createClient()).auth.getClaims();
  const claims = data?.claims;
  const forAdmin = next === "/admin" || next.startsWith("/admin/") || next.startsWith("/admin?");
  // Already signed in: carry on, unless they're heading for the admin area without the role.
  if (claims && (!forAdmin || isAdminClaims(claims))) redirect(next);

  if (claims) {
    return (
      <div className="space-y-4">
        <p>
          You&apos;re signed in as <strong>{claims.email ?? "this account"}</strong>, which doesn&apos;t have access to the admin
          area.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="min-h-12 rounded-md border-2 border-ink bg-white px-5 font-semibold hover:bg-paper">
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {one(sp.error) ? (
        <p role="alert" className="rounded-md border border-stamp-red bg-stamp-wash p-3 text-[0.94rem] text-stamp-red">
          Google sign-in didn&apos;t finish, so you&apos;re not signed in. Try again.
        </p>
      ) : null}
      <LoginForm next={next} />
      <p className="text-sm leading-relaxed text-ink-soft">
        Google shares your name, email address and profile picture with us to sign you in. We don&apos;t post anything or read
        your Google data.
      </p>
    </div>
  );
}

export default function LoginPage(props: PageProps<"/auth/login">) {
  return (
    <Page>
      <div className="mx-auto max-w-[26rem]">
        <h1 className="font-expanded text-[1.9rem] leading-tight font-extrabold tracking-tight">Sign in</h1>
        <p className="mt-2 text-ink-soft">Save jobs, track your applications and see jobs matched to your degree. Searching jobs doesn&apos;t need an account.</p>
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
          <Guilloche className="h-6 w-full bg-teal-wash text-teal/40" />
          <div className="p-6">
            <Suspense fallback={<div aria-busy="true" className="h-12 rounded-md bg-line/40" />}>
              <SignIn searchParams={props.searchParams} />
            </Suspense>
          </div>
        </div>
      </div>
    </Page>
  );
}
