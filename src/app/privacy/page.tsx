import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/legal";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${SITE_NAME} collects, why, and your rights. No accounts, cookies or tracking for job seekers.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <LegalPage
      title="Privacy"
      intro={
        <p>
          You can search and read every job on {SITE_NAME} without an account, and we don&apos;t put cookies or anything else on your
          device. This page explains the little we do collect.
        </p>
      }
    >
      <h2>Who we are</h2>
      <p>
        {SITE_NAME} (&quot;we&quot;) runs this website and is the controller of the personal data described here under UK data
        protection law (the UK GDPR and the Data Protection Act 2018). Contact us about anything on this page at {mail}.
      </p>

      <h2>If you&apos;re looking for jobs</h2>
      <ul>
        <li>
          <strong>No cookies, no tracking.</strong> We don&apos;t use cookies, analytics, advertising or tracking scripts, and we don&apos;t
          store anything in your browser.
        </li>
        <li>
          <strong>Apply clicks.</strong> When you press Apply, we record which job it was, the time, and the channel tag in the link you
          followed (for example, that you came from our Telegram channel). We don&apos;t record your IP address, device or anything that
          identifies you. We use these counts to see which jobs and channels are useful.
        </li>
        <li>
          <strong>Server logs.</strong> Our hosting provider, Vercel, keeps standard request logs, which include IP addresses, for a short
          time to run and protect the site. We use them only to fix problems and stop abuse.
        </li>
        <li>
          <strong>Emails.</strong> If you email us, we keep your message and address to reply, and delete them when they&apos;re no longer
          needed.
        </li>
      </ul>

      <h2>If you sign in</h2>
      <p>
        Signing in is only for the people who run the site. Google shares the account&apos;s name, email address and profile picture with
        us so we can sign you in; we keep them for as long as the account exists. Signing in sets cookies that keep the session open;
        they&apos;re needed for sign-in to work and are only set on the sign-in and admin pages.
      </p>

      <h2>Jobs and employers</h2>
      <p>
        Job details come from employers&apos; public job boards and NHS Jobs, and employer details from the Home Office Register of
        Licensed Sponsors. When you press Apply, you leave our site for the employer&apos;s, whose own privacy policy then applies.
      </p>

      <h2>Why we&apos;re allowed to use this data</h2>
      <p>
        We rely on our legitimate interests: running a reliable, secure site, understanding which jobs and channels help people, and
        answering messages. We don&apos;t sell personal data, use it for advertising, or make automated decisions about you.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>Vercel</strong> hosts the website.</li>
        <li><strong>Supabase</strong> hosts our database and handles sign-in.</li>
        <li><strong>Google</strong> provides sign-in for the site&apos;s administrators.</li>
      </ul>
      <p>
        Some of these providers process data outside the UK. Where they do, they use the safeguards UK law requires, such as the UK
        International Data Transfer Addendum.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us for a copy of your personal data, to correct or delete it, or to stop using it. Email {mail} and we&apos;ll reply
        within one month. If you&apos;re unhappy with how we&apos;ve handled your data, you can complain to the Information
        Commissioner&apos;s Office at <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>.
      </p>

      <h2>Changes</h2>
      <p>
        If we add accounts or email alerts for job seekers, we&apos;ll update this page before they launch, and the date at the top will
        change. See also our <Link href="/terms">terms of use</Link>.
      </p>
    </LegalPage>
  );
}
