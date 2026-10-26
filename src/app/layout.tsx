import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { Guilloche } from "@/components/site/guilloche";
import { AccountMenu } from "@/components/site/account-menu";
import { Container } from "@/components/site/container";
import { LogoMark } from "@/components/site/logo";
import { MainNav } from "@/components/site/main-nav";
import { FIELD_LABEL } from "@/lib/scoring/fields";
import { CONTACT_EMAIL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site/config";
import "./globals.css";

// One family; its width axis gives headings their document-style expanded form.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: graduate jobs at licensed sponsors`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_GB" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#16233f" };

const FOOTER_FIELDS = ["software", "data", "engineering", "healthcare", "finance", "science"] as const;

function FooterLinks({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2 text-ink-soft">
        {links.map((l) => (
          <li key={l.href}>
            {l.href.startsWith("mailto:") ? (
              <a className="hover:text-ink hover:underline hover:underline-offset-4" href={l.href}>{l.label}</a>
            ) : (
              <Link className="hover:text-ink hover:underline hover:underline-offset-4" href={l.href}>{l.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="bg-ink text-white">
          <Container className="flex items-center justify-between gap-6 py-3">
            <Link href="/" className="flex items-center gap-2.5 py-1 font-expanded text-[1.05rem] font-extrabold tracking-tight sm:text-lg">
              <LogoMark className="size-7 shrink-0 rounded-[7px] ring-1 ring-white/25" />
              {SITE_NAME}
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <MainNav />
              <AccountMenu />
            </div>
          </Container>
          <Guilloche className="h-5 w-full text-teal-wash/40" />
        </header>

        <main id="main" className="w-full flex-1">
          {children}
        </main>

        <footer className="border-t border-line bg-white text-sm">
          <Container className="grid gap-x-10 gap-y-8 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="space-y-3 leading-relaxed text-ink-soft">
              <Link href="/" className="flex items-center gap-2 font-expanded font-extrabold text-ink">
                <LogoMark className="size-6 rounded-[6px]" />
                {SITE_NAME}
              </Link>
              <p>
                <strong className="text-ink">Facts, not immigration advice.</strong> We report what the sponsor register, the job ad and
                the published Skilled Worker rules say. For advice, use a regulated adviser or{" "}
                <a className="underline underline-offset-2" href="https://www.gov.uk/skilled-worker-visa">gov.uk</a>.
              </p>
              <p>Never pay anyone for a job offer or a certificate of sponsorship.</p>
            </div>
            <FooterLinks
              title="Jobs by field"
              links={FOOTER_FIELDS.map((f) => ({ href: `/?field=${f}`, label: FIELD_LABEL[f] }))}
            />
            <FooterLinks
              title="Guides"
              links={[
                { href: "/how-we-check", label: "How we check jobs" },
                { href: "/junior-doctors", label: "Junior doctors" },
                { href: "/?grad=1", label: "Graduate schemes" },
              ]}
            />
            <FooterLinks
              title="About"
              links={[
                { href: "/privacy", label: "Privacy" },
                { href: "/terms", label: "Terms of use" },
                { href: `mailto:${CONTACT_EMAIL}`, label: "Contact us" },
              ]}
            />
          </Container>
          <div className="border-t border-line">
            <Container className="py-5 text-xs leading-relaxed text-ink-soft">
              Sponsor data: Home Office Register of Licensed Sponsors. Salary rules: Immigration Rules Appendix Skilled Occupations. Both
              Crown copyright, used under the Open Government Licence v3.0.
            </Container>
          </div>
        </footer>
      </body>
    </html>
  );
}
