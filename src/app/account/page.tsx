import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DeleteAccount } from "@/components/account/delete-account";
import { EducationSection, ExperienceSection, PreferencesSection } from "@/components/account/sections";
import { Page } from "@/components/site/container";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccount } from "@/lib/account/data";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

async function Account() {
  // Per request: whose account it is, and this year for the graduation-year list.
  await connection();
  const user = await requireUser("/account");
  const { preferences, education, experience } = await getAccount(user.id);
  const initial = (user.name ?? user.email ?? "?").trim()[0]?.toUpperCase();

  return (
    <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      <aside aria-label="Signed in as" className="mb-8 lg:mb-0">
        <div className="rounded-lg border border-line bg-white p-5 lg:sticky lg:top-6">
          <div className="flex items-center gap-3.5 lg:flex-col lg:items-start">
            <Avatar className="size-14 lg:size-16">
              {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
              <AvatarFallback className="bg-teal-wash text-lg font-bold text-teal">{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="font-semi-expanded text-xl leading-tight font-bold">{user.name ?? "Your account"}</h1>
              <p className="mt-0.5 truncate text-sm text-ink-soft">{user.email}</p>
              <p className="text-sm text-ink-soft">Signed in with Google</p>
            </div>
          </div>
          <form action="/auth/signout" method="post" className="mt-4 border-t border-line pt-4">
            <button type="submit" className="h-10 w-full rounded-lg border border-line bg-white text-[0.94rem] font-semibold hover:border-ink">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 space-y-12">
        {education.length === 0 ? (
          <p className="rounded-lg border border-teal/30 bg-teal-wash p-4 text-[0.94rem] text-ink">
            <strong className="text-teal">Start with your degree.</strong> It&apos;s how we match jobs to you. Experience and preferences are
            optional.
          </p>
        ) : null}
        <EducationSection items={education} currentYear={new Date().getFullYear()} />
        <ExperienceSection items={experience} />
        <PreferencesSection preferences={preferences} />

        <section aria-labelledby="delete" className="border-t border-line pt-8">
          <h2 id="delete" className="font-semi-expanded text-xl font-bold">Delete your account</h2>
          <p className="mt-1 max-w-[36rem] text-[0.94rem] text-ink-soft">
            Removes your degrees, experience and preferences straight away. See our{" "}
            <Link className="underline underline-offset-2" href="/privacy">
              privacy notice
            </Link>
            .
          </p>
          <div className="mt-4">
            <DeleteAccount />
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Page>
      <Suspense fallback={<Skeleton className="h-[32rem] bg-white" />}>
        <Account />
      </Suspense>
    </Page>
  );
}
