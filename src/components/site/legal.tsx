import { LEGAL_UPDATED } from "@/lib/site/config";
import { Page } from "./container";

/** Shared frame for the Privacy and Terms pages: same measure and headings as "How we check". */
export function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  const updated = new Date(LEGAL_UPDATED).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  return (
    <Page>
      <article className="max-w-[38rem] leading-relaxed">
        <h1 className="font-expanded text-[1.9rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-[2.4rem]">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Last updated {updated}</p>
        <div className="mt-4 text-[1.05rem] text-ink-soft">{intro}</div>
        <div className="[&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:font-semi-expanded [&_h2]:text-xl [&_h2]:font-bold [&_li]:mt-2 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </Page>
  );
}
