/**
 * The brand mark: an entry stamp with a tick, the site's "checked" in one shape. Shapes
 * only (no lettering), so it renders the same as a favicon, an app icon and in the header.
 */
export const LOGO_PATHS = {
  frame: "M9.2 8.6l13.6-1.9a2 2 0 0 1 2.3 1.7l1.9 13.6a2 2 0 0 1-1.7 2.3L11.7 26.2a2 2 0 0 1-2.3-1.7L7.5 10.9a2 2 0 0 1 1.7-2.3z",
  tick: "M11.6 16.9l3.4 3.5 6.6-8",
};

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <rect width="32" height="32" rx="7" fill="#16233f" />
      <path d={LOGO_PATHS.frame} fill="none" stroke="#e3f1ef" strokeWidth="1.6" />
      <path d={LOGO_PATHS.tick} fill="none" stroke="#5fc2b8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
