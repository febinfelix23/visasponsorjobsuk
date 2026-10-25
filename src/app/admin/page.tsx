import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CopyBlock } from "@/components/admin/copy-block";
import { Stamp } from "@/components/site/stamp";
import { isAdmin } from "@/lib/admin/access";
import { FIELD_LABEL } from "@/lib/scoring/fields";
import {
  channelLink,
  groupByField,
  instagramCaption,
  isoDay,
  londonDate,
  POST_SIZE,
  redditRoundup,
  selectForPost,
  TELEGRAM_LIMIT,
  telegramPost,
  whatsappDigest,
} from "@/lib/admin/posts";
import { SITE_URL } from "@/lib/site/config";
import { clicksByChannel, postCandidates } from "@/lib/site/queries";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

const PERIODS = [
  { days: 1, label: "24 hours" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
];

function parse(sp: SearchParams) {
  const one = (k: string) => Number(Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  return PERIODS.some((p) => p.days === one("days")) ? one("days") : 1;
}

const hrefFor = (days: number) => `/admin?days=${days}`;

function Choice({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "true" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-semibold",
        current ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink",
      )}
    >
      {children}
    </Link>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-8">
      <h2 id={id} className="font-semi-expanded text-xl font-bold">{title}</h2>
      {note ? <p className="mt-1 text-[0.94rem] text-ink-soft">{note}</p> : null}
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  );
}

async function AdminContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Per request: who's asking and today's date both change.
  await connection();
  if (!(await isAdmin())) notFound();
  const days = parse(await searchParams);

  const siteUrl = SITE_URL;
  const now = new Date();
  const daily = { siteUrl, date: now, campaign: `daily-${isoDay(now)}` };
  const weekly = { siteUrl, date: now, campaign: `weekly-${isoDay(now)}` };

  const [recent, week, clicks] = await Promise.all([postCandidates(days), postCandidates(7), clicksByChannel(7)]);
  // Fixed sizes: Telegram's picks include WhatsApp's and Instagram's, as all three take the same order.
  const telegram = selectForPost(recent, POST_SIZE.telegram);
  const whatsapp = selectForPost(recent, POST_SIZE.whatsapp);
  const slides = selectForPost(recent, POST_SIZE.instagram);
  const reddit = redditRoundup(groupByField(selectForPost(week, POST_SIZE.reddit)), weekly);
  const date = londonDate(now);
  const period = PERIODS.find((p) => p.days === days)!.label;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-soft">New in the last</p>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <Choice key={p.days} href={hrefFor(p.days)} current={p.days === days}>{p.label}</Choice>
            ))}
          </div>
        </div>
        {process.env.NEXT_PUBLIC_SITE_URL ? null : (
          <p className="rounded-md border border-amber bg-amber-wash p-3 text-[0.94rem] text-amber">
            NEXT_PUBLIC_SITE_URL isn&apos;t set, so links point to {siteUrl}. Set it to the live domain before posting.
          </p>
        )}
      </div>

      {telegram.length === 0 ? (
        <p className="rounded-md border border-line bg-white p-4">
          No new jobs passed the sponsorship check in the last {period}.{" "}
          {days < 7 ? <Link className="underline underline-offset-2" href={hrefFor(7)}>Show the last 7 days</Link> : null}
        </p>
      ) : (
        <>
          <Section
            id="picks"
            title="Picks"
            note={`The best jobs from the last ${period}, spread across fields and one per employer. Telegram posts all ${POST_SIZE.telegram}, Instagram the first ${POST_SIZE.instagram}, WhatsApp the first ${POST_SIZE.whatsapp}.`}
          >
            {telegram.length < POST_SIZE.telegram ? (
              <p className="rounded-md border border-amber bg-amber-wash p-3 text-[0.94rem] text-amber">
                Only {telegram.length} {telegram.length === 1 ? "job" : "jobs"} passed in the last {period}, so today&apos;s posts are shorter.{" "}
                {days < 7 ? <Link className="underline underline-offset-2" href={hrefFor(7)}>Use the last 7 days</Link> : null}
              </p>
            ) : null}
            <ol className="divide-y divide-line border-y border-line">
              {telegram.map((j, i) => (
                <li key={j.slug} className="flex items-start justify-between gap-3 py-2 text-[0.94rem]">
                  <span className="flex min-w-0 gap-3">
                    <span className="w-5 shrink-0 text-right text-ink-soft tabular">{i + 1}</span>
                    <span className="min-w-0">
                      <Link href={`/jobs/${j.slug}`} className="font-semibold underline-offset-4 hover:underline">{j.title}</Link>
                      <span className="block text-ink-soft">
                        {j.employerName}, {FIELD_LABEL[j.field ?? ""] ?? "Other"}
                      </span>
                    </span>
                  </span>
                  <Stamp status={j.sponsorability} className="shrink-0" />
                </li>
              ))}
            </ol>
          </Section>

          <Section id="telegram" title="Telegram" note={`${POST_SIZE.telegram} jobs. Paste into the channel; Telegram turns **text** into bold when you send it.`}>
            <CopyBlock key={`tg-${days}`} label="Telegram post" text={telegramPost(groupByField(telegram), daily)} limit={TELEGRAM_LIMIT} rows={16} />
          </Section>

          <Section id="whatsapp" title="WhatsApp channel" note={`${POST_SIZE.whatsapp} jobs. WhatsApp's bold is *text*.`}>
            <CopyBlock key={`wa-${days}`} label="WhatsApp digest" text={whatsappDigest(groupByField(whatsapp), daily)} rows={14} />
          </Section>

          <Section id="instagram" title="Instagram carousel" note={`A cover and ${POST_SIZE.instagram} job slides. Download them in order and post as one carousel.`}>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { key: "cover", src: `/admin/cards/cover?count=${slides.length}&date=${encodeURIComponent(date)}`, name: `00-cover.png`, alt: "Cover slide" },
                ...slides.map((j, i) => ({
                  key: j.slug,
                  src: `/admin/cards/job/${j.slug}?i=${i + 1}&of=${slides.length}`,
                  name: `${String(i + 1).padStart(2, "0")}-${j.slug.slice(0, 40)}.png`,
                  alt: `${j.title} at ${j.employerName}`,
                })),
              ].map((s) => (
                <li key={s.key}>
                  <a href={s.src} download={s.name} className="block rounded-md border border-line bg-white p-1 hover:border-ink">
                    {/* Admin-only PNGs from our own route; next/image would only re-encode them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt={s.alt} width={1080} height={1350} loading="lazy" className="h-auto w-full rounded" />
                    <span className="block px-1 pt-1 text-sm font-semibold">Download</span>
                  </a>
                </li>
              ))}
            </ol>
            <CopyBlock key={`ig-${days}`} label="Caption" text={instagramCaption(slides, daily)} limit={2200} rows={10} />
            <CopyBlock label="Link for the bio" text={channelLink(siteUrl, "/", "instagram", "bio")} rows={2} />
          </Section>

          <Section
            id="reddit"
            title="Reddit weekly roundup"
            note={`${POST_SIZE.reddit} jobs from the last 7 days, whatever period is chosen above. Post once a week, and only in subreddits whose rules allow roundups; read the rules first.`}
          >
            <CopyBlock label="Title" text={reddit.title} limit={300} rows={2} />
            <CopyBlock label="Body (Markdown)" text={reddit.body} limit={40000} rows={16} />
          </Section>
        </>
      )}

      <Section id="clicks" title="Apply clicks by channel" note="Last 7 days. A click is someone opening the employer's ad from a job page.">
        {clicks.length === 0 ? (
          <p className="text-ink-soft">No apply clicks yet.</p>
        ) : (
          <table className="w-full text-left text-[0.94rem] tabular">
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th scope="col" className="py-2 font-semibold">Channel</th>
                <th scope="col" className="py-2 text-right font-semibold">Clicks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clicks.map((c) => (
                <tr key={c.source}>
                  <td className="py-2">{c.source}</td>
                  <td className="py-2 text-right font-semibold">{c.clicks.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-expanded text-[1.9rem] leading-tight font-extrabold tracking-tight">Posting helper</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-[0.94rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <p className="mt-2 mb-8 text-ink-soft">Today&apos;s posts for each channel, picked automatically. Edit if you need to, copy, then paste.</p>
      <Suspense fallback={<div aria-busy="true" className="h-96 rounded-lg bg-white" />}>
        <AdminContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
