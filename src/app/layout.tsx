import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { Guilloche } from "@/components/site/guilloche";
import "./globals.css";

// One family; its width axis gives headings their document-style expanded form.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Visa Sponsor Jobs UK: graduate jobs at licensed sponsors", template: "%s | Visa Sponsor Jobs UK" },
  description:
    "Graduate and early-career jobs at UK employers licensed to sponsor Skilled Worker visas, each checked against the salary and occupation rules.",
};

export const viewport: Viewport = { themeColor: "#16233f" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="bg-ink text-white">
          <div className="mx-auto flex max-w-[44rem] flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 pt-4 pb-3">
            <Link href="/" className="font-expanded text-lg font-extrabold tracking-tight">
              Visa Sponsor Jobs UK
            </Link>
            <nav aria-label="Main" className="flex gap-5 text-[0.94rem] text-white/80">
              <Link href="/" className="hover:text-white">Jobs</Link>
              <Link href="/junior-doctors" className="hover:text-white">Junior doctors</Link>
              <Link href="/how-we-check" className="hover:text-white">How we check</Link>
            </nav>
          </div>
          <Guilloche className="h-6 w-full text-teal-wash/40" />
        </header>

        <main id="main" className="mx-auto w-full max-w-[44rem] flex-1 px-4 pt-8 pb-16">
          {children}
        </main>

        <footer className="border-t border-line bg-white">
          <div className="mx-auto max-w-[44rem] space-y-3 px-4 py-8 text-sm leading-relaxed text-ink-soft">
            <p>
              <strong className="text-ink">Facts, not immigration advice.</strong> We report what the sponsor register,
              the job ad and the published Skilled Worker rules say. We can&apos;t tell you whether you&apos;ll get a visa;
              for advice, use a regulated adviser or{" "}
              <a className="underline underline-offset-2" href="https://www.gov.uk/skilled-worker-visa">gov.uk</a>.
            </p>
            <p>Never pay anyone for a job offer or a certificate of sponsorship. Licensed sponsors can&apos;t charge you for it.</p>
            <p>
              Sponsor data: Home Office Register of Licensed Sponsors. Salary rules: Immigration Rules Appendix Skilled
              Occupations. Both under the Open Government Licence v3.0.{" "}
              <Link className="underline underline-offset-2" href="/how-we-check">How we check jobs</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
