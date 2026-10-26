import { cn } from "@/lib/utils";

/** Words that say nothing about which employer it is. */
const FILLER = new Set(["the", "of", "and", "for", "ltd", "limited", "plc", "llp", "uk", "group", "&", "-", "nhs", "trust", "foundation"]);

/** Two letters for an employer: "Wise Payments Limited" → "WP", "Monzo Bank Ltd" → "MB", "Mid and South Essex NHS Foundation Trust" → "MS". */
export function initials(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s/]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w && !FILLER.has(w.toLowerCase()));
  const letters = words.slice(0, 2).map((w) => w[0]);
  return (letters.join("") || name.trim()[0] || "?").toUpperCase();
}

/** The employer's initials in a stamped square: one quiet style for every employer, so it never competes with the stamp. */
export function Monogram({ name, size = "md", className }: { name: string; size?: "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-teal/25 bg-teal-wash font-semi-expanded font-bold text-teal",
        size === "md" ? "size-11 text-[0.94rem]" : "size-14 text-lg",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
