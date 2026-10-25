"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** A post ready to paste: editable before copying, with a character count against the channel's limit. */
export function CopyBlock({ label, text, limit, rows = 12 }: { label: string; text: string; limit?: number; rows?: number }) {
  const id = useId();
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const over = limit !== undefined && value.length > limit;

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="font-semibold" htmlFor={id}>{label}</label>
        <button type="button" onClick={copy} className="min-h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="mt-2 w-full rounded-md border border-line bg-white p-3 font-mono text-[0.8rem] leading-relaxed"
      />
      <p className={cn("mt-1 text-sm tabular", over ? "font-semibold text-stamp-red" : "text-ink-soft")} aria-live="polite">
        {value.length.toLocaleString("en-GB")} characters{limit ? ` of ${limit.toLocaleString("en-GB")}` : ""}
        {over ? ". Too long to post: shorten it first." : ""}
      </p>
    </div>
  );
}
