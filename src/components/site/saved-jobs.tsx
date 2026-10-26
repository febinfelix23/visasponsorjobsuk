"use client";

import { BookmarkIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { savedJobIdsAction, toggleSaveAction } from "@/app/account/jobs/actions";
import { cn } from "@/lib/utils";

type Saved = { ids: Set<number>; toggle: (jobId: number) => Promise<string | null> };

const SavedContext = createContext<Saved | null>(null);

/** Supabase's session cookies start with "sb-"; without one there's nobody to load saved jobs for. */
const maybeSignedIn = () => typeof document !== "undefined" && /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);

/**
 * Which jobs the visitor has saved, loaded once in the browser so job pages and lists stay
 * prerendered. Signed-out visitors never call the server.
 */
export function SavedJobsProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<number>>(new Set());
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!maybeSignedIn()) return;
    savedJobIdsAction()
      .then((list) => setIds(new Set(list ?? [])))
      .catch(() => {});
  }, []);

  const toggle = useCallback(
    async (jobId: number) => {
      // Optimistic: flip now. The server toggles and reports the result, which always wins,
      // so a click before the saved list has loaded still ends in the right state.
      const wasSaved = ids.has(jobId);
      const flip = (saved: boolean) =>
        setIds((prev) => {
          const next = new Set(prev);
          if (saved) next.add(jobId);
          else next.delete(jobId);
          return next;
        });
      flip(!wasSaved);
      const result = await toggleSaveAction(jobId).catch(() => ({ error: "Couldn't save that job. Try again." }));
      if ("signIn" in result) {
        flip(false);
        router.push(`/auth/login?next=${encodeURIComponent(pathname)}`);
        return null;
      }
      if ("error" in result) {
        flip(wasSaved);
        return result.error;
      }
      flip(result.saved);
      return null;
    },
    [ids, pathname, router],
  );

  const value = useMemo(() => ({ ids, toggle }), [ids, toggle]);
  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

/** Bookmark a job. Signed out, it goes to sign-in and back. */
export function SaveButton({ jobId, title, variant = "icon", className }: { jobId: number; title: string; variant?: "icon" | "full"; className?: string }) {
  const ctx = useContext(SavedContext);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const saved = ctx?.ids.has(jobId) ?? false;
  const onClick = (e: React.MouseEvent) => {
    // Rows are links: saving mustn't also open the job.
    e.preventDefault();
    e.stopPropagation();
    if (!ctx) return;
    start(async () => setError(await ctx.toggle(jobId)));
  };
  const label = saved ? `Remove ${title} from your saved jobs` : `Save ${title}`;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={saved}
        aria-label={variant === "icon" ? label : undefined}
        title={variant === "icon" ? (saved ? "Saved" : "Save job") : undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-60",
          variant === "icon"
            ? "size-9 rounded-md text-ink-soft hover:bg-teal-wash hover:text-teal aria-pressed:text-teal"
            : "h-12 w-full rounded-md border border-line bg-white px-4 text-[0.94rem] text-ink hover:border-ink aria-pressed:border-teal aria-pressed:bg-teal-wash aria-pressed:text-teal",
          className,
        )}
      >
        <BookmarkIcon aria-hidden className={cn("size-[1.15rem]", saved && "fill-current")} />
        {variant === "full" ? (saved ? "Saved" : "Save job") : null}
      </button>
      {error ? (
        <span role="alert" className="text-sm font-semibold text-stamp-red">
          {error}
        </span>
      ) : null}
    </>
  );
}
