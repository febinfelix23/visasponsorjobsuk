import type { Metadata } from "next";
import { Stamp } from "@/components/site/stamp";
import { RULES_SOURCE, RULES_UPDATED_AT } from "@/lib/scoring/occupations";
import { Page } from "@/components/site/container";

export const metadata: Metadata = {
  title: "How we check jobs",
  description: "Where our data comes from, how each job is checked against the Skilled Worker rules, and what we can't tell you.",
  alternates: { canonical: "/how-we-check" },
};

const rulesDate = new Date(RULES_UPDATED_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export default function HowWeCheckPage() {
  return (
    <Page>
      <article className="max-w-[38rem] leading-relaxed">
        <h1 className="font-expanded text-[1.9rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-[2.4rem]">How we check jobs</h1>
        <p className="mt-4 text-[1.05rem] text-ink-soft">
          We list jobs from employers on the UK government&apos;s register of licensed sponsors. We read each ad in full and check it
          against the Skilled Worker rules, for graduates switching from a Student or Graduate visa and for people already in the UK
          looking for a new sponsored job.
        </p>

        <h2 className="mt-10 font-semi-expanded text-xl font-bold">Reading the ad</h2>
        <p className="mt-3">
          An AI model reads the whole ad and picks out what it says about sponsorship, the contract, the hours, the salary, the
          experience asked for and where the job is based. Every fact must come with the ad&apos;s own words, and we check those
          words are really in the ad; a fact we can&apos;t find in the ad is ignored. Our own phrase rules read the ad too, and if
          either finds a clear &ldquo;no sponsorship&rdquo;, the job is marked not sponsorable. A new or changed ad isn&apos;t listed
          until it has been read.
        </p>

        <h2 className="mt-10 font-semi-expanded text-xl font-bold">The checks</h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          <li><strong>Location.</strong> The job must be based in the UK.</li>
          <li><strong>Sponsor licence.</strong> The employer must be on the register, A-rated and licensed for the Skilled Worker route. We update the register every day.</li>
          <li><strong>What the ad says.</strong> A clear &ldquo;we can&apos;t sponsor&rdquo; rules a job out. If sponsorship depends on the role or the applicant, we ask you to check.</li>
          <li><strong>Contract and hours.</strong> Bank, locum, sessional, zero-hours, temporary, contractor, self-employed, internship and apprenticeship roles aren&apos;t listed, nor are fixed-term contracts under 12 months or part-time posts. If the ad doesn&apos;t state the contract or hours, the job isn&apos;t held back; the check says so.</li>
          <li><strong>Occupation.</strong> We match the role to a SOC 2020 occupation code and look up whether that occupation is eligible.</li>
          <li>
            <strong>Salary.</strong> We compare the salary with two rates for the occupation. The <em>new-entrant rate</em> is the
            higher of £33,400 and 70% of the going rate; it applies, for example, to people switching from a Student or Graduate visa
            and to people under 26. The <em>general rate</em> is the higher of £41,700 and the going rate, and applies to everyone
            else. A green result needs at least the new-entrant rate; jobs that also meet the general rate are tagged. NHS posts on
            national pay scales at Band 5 or above meet both.
          </li>
          <li><strong>Experience.</strong> We note the experience the ad asks for, from graduate or entry level to senior. It doesn&apos;t change the result, but you can filter by it.</li>
        </ol>

        <h2 className="mt-10 font-semi-expanded text-xl font-bold">The results</h2>
        <dl className="mt-3 space-y-4">
          <div><dt><Stamp status="sponsorship_mentioned" /></dt><dd className="mt-1 text-ink-soft">The ad says sponsorship is available, in words we&apos;ve checked, and every other check passes.</dd></div>
          <div><dt><Stamp status="likely_eligible" /></dt><dd className="mt-1 text-ink-soft">The ad doesn&apos;t mention sponsorship, but every check we can make passes: licence, contract, hours, occupation and salary.</dd></div>
          <div><dt><Stamp status="check_with_employer" /></dt><dd className="mt-1 text-ink-soft">The employer is licensed, but we couldn&apos;t confirm everything from the ad, usually the salary, or the ad says sponsorship depends on the role. Ask them.</dd></div>
          <div><dt><Stamp status="unknown" /></dt><dd className="mt-1 text-ink-soft">We couldn&apos;t match the employer to an A-rated Skilled Worker licence. That doesn&apos;t always mean they aren&apos;t licensed.</dd></div>
          <div><dt><Stamp status="ineligible" /></dt><dd className="mt-1 text-ink-soft">Something rules sponsorship out: the ad says no, the contract or hours, a salary below the new-entrant rate, an ineligible occupation, or a job based abroad. These aren&apos;t listed.</dd></div>
        </dl>

        <h2 className="mt-10 font-semi-expanded text-xl font-bold">What we can&apos;t tell you</h2>
        <p className="mt-3">
          We report facts from public sources. We can&apos;t say whether an employer will sponsor you, or whether you&apos;ll be
          granted a visa: that depends on the employer, your circumstances and the Home Office. This is not immigration advice.
          For advice, use a regulated immigration adviser, or read the official guidance on{" "}
          <a className="underline underline-offset-2" href="https://www.gov.uk/skilled-worker-visa">gov.uk</a>.
        </p>
        <p className="mt-3">
          Our checks can be wrong. A job can map to the wrong occupation, an ad can be misread, or a salary can be missing. Always
          confirm with the employer before you rely on a result.
        </p>

        <h2 className="mt-10 font-semi-expanded text-xl font-bold">Avoiding scams</h2>
        <p className="mt-3">
          Licensed sponsors can&apos;t charge you for a job or a certificate of sponsorship. If anyone asks you to pay for either,
          it&apos;s a scam. We link only to employers&apos; own job pages and NHS Jobs.
        </p>

        <h2 className="mt-10 font-semi-expanded text-xl font-bold">Sources</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
          <li><a className="underline underline-offset-2" href="https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers">Register of licensed sponsors: workers</a>, Home Office, updated daily.</li>
          <li><a className="underline underline-offset-2" href={RULES_SOURCE}>Immigration Rules Appendix Skilled Occupations</a>, the version updated {rulesDate}.</li>
          <li>Companies House company data, to tell which sector each sponsor works in.</li>
          <li>Employers&apos; own job boards and NHS Jobs, checked twice a day.</li>
        </ul>
        <p className="mt-3 text-sm text-ink-soft">Government data is used under the Open Government Licence v3.0.</p>
      </article>
    </Page>
  );
}
