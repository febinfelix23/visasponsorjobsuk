import { cn } from "@/lib/utils";
import type { Sponsorability } from "@/lib/scoring/score";
import { BADGE } from "./format";

const TONE: Record<(typeof BADGE)[Sponsorability]["tone"], string> = {
  "teal-strong": "border-teal bg-teal text-white",
  teal: "border-teal bg-teal-wash text-teal",
  amber: "border-amber bg-amber-wash text-amber",
  grey: "border-ink-soft/50 bg-white text-ink-soft",
  red: "border-stamp-red bg-stamp-wash text-stamp-red",
};

/**
 * The sponsorship result, drawn like an entry stamp: a bordered mark set slightly
 * off-square. The one decorative flourish on the page, so it's the thing people scan for.
 */
export function Stamp({ status, size = "sm", className }: { status: Sponsorability; size?: "sm" | "lg"; className?: string }) {
  const badge = BADGE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[5px] border-2 font-semi-expanded font-bold leading-none whitespace-nowrap",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)] [transform:rotate(-1.5deg)]",
        size === "sm" ? "px-2 py-1 text-[0.72rem]" : "px-3 py-1.5 text-sm",
        TONE[badge.tone],
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
