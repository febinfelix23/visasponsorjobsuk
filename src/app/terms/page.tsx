import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/legal";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `The terms for using ${SITE_NAME}: what our checks mean, what they don't, and our responsibilities.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <p>
          These terms apply when you use {SITE_NAME}. By using the site you accept them. They don&apos;t affect your rights as a
          consumer under UK law.
        </p>
      }
    >
      <h2>What the site does</h2>
      <p>
        We list jobs at UK employers on the Home Office Register of Licensed Sponsors and check each one, automatically, against the
        published Skilled Worker rules: the sponsor licence, the occupation and the new-entrant salary. The site is free to use.{" "}
        <Link href="/how-we-check">How we check jobs</Link> explains the method.
      </p>

      <h2>This is not immigration advice</h2>
      <p>
        We report facts from public sources. We don&apos;t give immigration advice and aren&apos;t regulated to do so. A result such as
        &quot;Likely eligible&quot; means the information we could find meets the published rules; it isn&apos;t a promise that an
        employer will sponsor you or that you&apos;ll get a visa. Employers decide whether to sponsor a role, and the Home Office decides
        visa applications. For advice on your situation, use a regulated immigration adviser or solicitor, or see{" "}
        <a href="https://www.gov.uk/skilled-worker-visa">gov.uk</a>.
      </p>

      <h2>Accuracy</h2>
      <p>
        Job ads change and close, the sponsor register is updated daily, and the rules change. We update the site twice a day but
        can&apos;t guarantee every detail is correct or current. Always check the job, the salary and the employer&apos;s willingness to
        sponsor with the employer before you apply or make decisions.
      </p>

      <h2>Other websites</h2>
      <p>
        Job ads belong to the employers who publish them. Apply links take you to the employer&apos;s site or NHS Jobs, which have their
        own terms; we&apos;re not responsible for their content or for how they handle your application.
      </p>

      <h2>Stay safe</h2>
      <p>
        We never charge job seekers, and licensed sponsors can&apos;t charge you for a job offer or a certificate of sponsorship. If anyone
        asks you to pay for either, don&apos;t, and report it to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Using the site fairly</h2>
      <p>
        Please don&apos;t use the site in a way that harms it or other people: for example, overloading it with automated requests,
        trying to get into the admin area, or presenting our checks as immigration advice. We may block access that does.
      </p>

      <h2>Our content</h2>
      <p>
        The site&apos;s design, text and checks are ours. Sponsor register and Immigration Rules data are Crown copyright, used under the
        Open Government Licence v3.0. You&apos;re welcome to share links to any page.
      </p>

      <h2>Our responsibility to you</h2>
      <p>
        We provide the site as it is, free of charge, and aren&apos;t liable for losses caused by relying on it, such as a missed job or an
        unsuccessful application, except where the law doesn&apos;t allow that to be limited. Nothing in these terms limits liability for
        death or personal injury caused by negligence, or for fraud.
      </p>

      <h2>Changes and law</h2>
      <p>
        We may update these terms; the date at the top shows the latest version. These terms are governed by the laws of England and
        Wales. If you live in Scotland or Northern Ireland, you can also bring claims in your local courts. Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also our <Link href="/privacy">privacy notice</Link>.
      </p>
    </LegalPage>
  );
}
