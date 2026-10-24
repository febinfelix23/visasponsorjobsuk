import type { Metadata } from "next";
import { Stamp } from "@/components/site/stamp";
import { RULES_SOURCE, RULES_UPDATED_AT } from "@/lib/scoring/occupations";

export const metadata: Metadata = {
  title: "How we check jobs",
  description: "Where our data comes from, how each job is checked against the Skilled Worker rules, and what we can't tell you.",
};

const rulesDate = new Date(RULES_UPDATED_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export default function HowWeCheckPage() {
  return (
    <article className="max-w-[38rem] leading-relaxed">
      <h1 className="font-expanded text-[1.9rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-[2.4rem]">How we check jobs</h1>
      <p className="mt-4 text-[1.05rem] text-ink-soft">
        We list jobs from employers on the UK government&apos;s register of licensed sponsors, then check each one against the
        Skilled Worker rules that apply to people switching from a Student or Graduate visa.
      </p>

      <h2 className="mt-10 font-semi-expanded text-xl font-bold">The checks</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-5">
        <li><strong>Sponsor licence.</strong> Is the employer on the register, licensed for the Skilled Worker route? We update the register every day.</li>
        <li><strong>Occupation.</strong> We match the job title to a SOC 2020 occupation code and look up whether that occupation is eligible.</li>
        <li><strong>Salary.</strong> We compare the advertised salary with the new-entrant rate for that occupation: the higher of £33,400 and 70% of its going rate. NHS posts on national pay scales count as meeting it.</li>
        <li><strong>The ad itself.</strong> If an ad says sponsorship isn&apos;t available, or the role is an internship, apprenticeship, self-employed or contract role, we mark it as not sponsorable.</li>
      </ol>

      <h2 className="mt-10 font-semi-expanded text-xl font-bold">The results</h2>
      <dl className="mt-3 space-y-4">
        <div><dt><Stamp status="sponsorship_mentioned" /></dt><dd className="mt-1 text-ink-soft">The ad itself says sponsorship is available.</dd></div>
        <div><dt><Stamp status="likely_eligible" /></dt><dd className="mt-1 text-ink-soft">Every check we can make passes: licence, occupation and salary.</dd></div>
        <div><dt><Stamp status="check_with_employer" /></dt><dd className="mt-1 text-ink-soft">The employer is licensed, but the ad doesn&apos;t show everything needed, usually the salary. Ask them.</dd></div>
        <div><dt><Stamp status="unknown" /></dt><dd className="mt-1 text-ink-soft">We couldn&apos;t match the employer to the register. That doesn&apos;t mean they aren&apos;t licensed.</dd></div>
        <div><dt><Stamp status="ineligible" /></dt><dd className="mt-1 text-ink-soft">The ad or the rules rule out sponsorship, for example a salary below the rate or an ineligible occupation.</dd></div>
      </dl>

      <h2 className="mt-10 font-semi-expanded text-xl font-bold">What we can&apos;t tell you</h2>
      <p className="mt-3">
        We report facts from public sources. We can&apos;t say whether an employer will sponsor you, or whether you&apos;ll be
        granted a visa: that depends on the employer, your circumstances and the Home Office. This is not immigration advice.
        For advice, use a regulated immigration adviser, or read the official guidance on{" "}
        <a className="underline underline-offset-2" href="https://www.gov.uk/skilled-worker-visa">gov.uk</a>.
      </p>
      <p className="mt-3">
        Our matching can be wrong. A job title can map to the wrong occupation, or a salary can be missing from an ad. Always
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
  );
}
