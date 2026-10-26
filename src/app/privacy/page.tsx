import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/legal";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${SITE_NAME} collects, why, and your rights. Searching jobs needs no account, cookies or tracking.`,
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
          <strong>No cookies, no tracking.</strong> Unless you sign in, we don&apos;t use cookies or store anything in your browser, and we
          never use analytics, advertising or tracking scripts.
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

      <h2>If you create an account</h2>
      <ul>
        <li>
          <strong>Sign-in.</strong> You sign in with Google, which shares your name, email address and profile picture with us. Signing in
          sets cookies that keep you signed in; they&apos;re needed for your account to work, and we don&apos;t set any others.
        </li>
        <li>
          <strong>Your profile.</strong> Your degrees (level, subject and year) and the places you want to work decide which jobs are matched
          to you. University, work and professional experience, and visa details are optional: experience adds a second view of matches, and
          your visa expiry is used only to flag jobs that close after it, never to give advice.
        </li>
        <li>
          <strong>Saved jobs.</strong> The jobs you save and the application status you give each one (applied, interview and so on), so you
          can track your search. Only you can see them.
        </li>
        <li>
          <strong>Keeping and deleting it.</strong> We keep your account until you delete it. Deleting it, from your account page, removes
          your profile, saved jobs and settings straight away.
        </li>
      </ul>

      <h2>Jobs and employers</h2>
      <p>
        Job details come from employers&apos; public job boards and NHS Jobs, and employer details from the Home Office Register of
        Licensed Sponsors. When you press Apply, you leave our site for the employer&apos;s, whose own privacy policy then applies.
      </p>

      <h2>Why we&apos;re allowed to use this data</h2>
      <p>
        For accounts, we use your data to provide the service you signed up for (our contract with you). Otherwise we rely on our
        legitimate interests: running a reliable, secure site, understanding which jobs and channels help people, and answering messages. We don&apos;t sell personal data, use it for advertising, or make automated decisions about you.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>Vercel</strong> hosts the website.</li>
        <li><strong>Supabase</strong> hosts our database and handles sign-in.</li>
        <li><strong>Google</strong> provides sign-in.</li>
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
        If we add new features that use personal data, such as payments or alerts, we&apos;ll update this page before they launch, and the
        date at the top will change. See also our <Link href="/terms">terms of use</Link>.
      </p>
    </LegalPage>
  );
}
