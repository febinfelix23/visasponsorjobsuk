import { Check, CircleAlert, X } from "lucide-react";
import type { Reason } from "@/lib/scoring/score";
import { cn } from "@/lib/utils";

type Verdict = "pass" | "warn" | "fail";
type Row = { rule: string; verdict: Verdict; message: string };

/** Which rule each scoring reason speaks to, and whether it passes. */
const REASON_ROWS: Record<string, { rule: string; verdict: Verdict }> = {
  licensed_sponsor: { rule: "Sponsor licence", verdict: "pass" },
  sponsor_not_confirmed: { rule: "Sponsor licence", verdict: "warn" },
  national_pay_scale: { rule: "Salary", verdict: "pass" },
  salary_meets_new_entrant: { rule: "Salary", verdict: "pass" },
  salary_below_new_entrant: { rule: "Salary", verdict: "fail" },
  salary_range_spans_rate: { rule: "Salary", verdict: "warn" },
  salary_unknown: { rule: "Salary", verdict: "warn" },
  occupation_limited: { rule: "Occupation", verdict: "warn" },
  occupation_unknown: { rule: "Occupation", verdict: "warn" },
  occupation_ineligible: { rule: "Occupation", verdict: "fail" },
  occupation_maybe_ineligible: { rule: "Occupation", verdict: "warn" },
  ad_mentions_sponsorship: { rule: "What the ad says", verdict: "pass" },
  ad_says_no_sponsorship: { rule: "What the ad says", verdict: "fail" },
  asks_right_to_work: { rule: "What the ad says", verdict: "warn" },
  self_employed: { rule: "Type of contract", verdict: "fail" },
  contractor: { rule: "Type of contract", verdict: "fail" },
  internship: { rule: "Type of contract", verdict: "fail" },
  apprenticeship: { rule: "Type of contract", verdict: "fail" },
  as_needed_contract: { rule: "Type of contract", verdict: "warn" },
};

const ICON: Record<Verdict, { Icon: typeof Check; className: string; label: string }> = {
  pass: { Icon: Check, className: "bg-teal text-white", label: "Meets this rule" },
  warn: { Icon: CircleAlert, className: "bg-amber-wash text-amber", label: "Couldn't confirm" },
  fail: { Icon: X, className: "bg-stamp-red text-white", label: "Doesn't meet this rule" },
};

export function rowsFor(reasons: Reason[]): Row[] {
  return reasons.flatMap((r) => {
    const row = REASON_ROWS[r.code];
    return row ? [{ ...row, message: r.message }] : [];
  });
}

/** The job page's centrepiece: one line per Skilled Worker rule, with what we found. */
export function SponsorshipCheck({ reasons }: { reasons: Reason[] }) {
  const rows = rowsFor(reasons);
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-white">
      {rows.map((row, i) => {
        const { Icon, className, label } = ICON[row.verdict];
        return (
          <li key={i} className="flex gap-3 p-4">
            <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", className)}>
              <Icon aria-hidden className="size-3.5" strokeWidth={3} />
              <span className="sr-only">{label}</span>
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{row.rule}</p>
              <p className="mt-0.5 text-[0.94rem] leading-relaxed text-ink-soft">{row.message}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
