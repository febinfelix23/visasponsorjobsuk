import { cn } from "@/lib/utils";

/**
 * A fine guilloche band, the interlaced line pattern printed on passports and visa
 * vignettes. The curves live in one static file (public/guilloche.svg), used as a mask
 * and filled with the text colour: browsers download it once, instead of every page
 * carrying ~20 KB of SVG paths, which also made each stored page (an ISR write) bigger.
 * `className` sizes the band and sets its colour (text-…) and backdrop (bg-…).
 */
export function Guilloche({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("block", className)}>
      <span className="block size-full bg-current [mask-image:url(/guilloche.svg)] [mask-size:100%_100%] [mask-repeat:no-repeat]" />
    </span>
  );
}
