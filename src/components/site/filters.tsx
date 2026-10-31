"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FIELD_LABEL } from "@/lib/scoring/fields";
import type { Filters, Sort } from "@/lib/site/queries";
import { activeFilterCount, searchHref } from "@/lib/site/search";
import { cn } from "@/lib/utils";

type PanelProps = {
  filters: Filters;
  /** Passing jobs per field, and the fields to offer (those with jobs, plus the selected one). */
  counts: Record<string, number>;
  fields: string[];
  /** A post's UTM tags, kept on every filter change. */
  utm: string;
};

/** Filter changes go straight to the address (page 1), so results, back button and shared links agree. */
function useApply(filters: Filters, utm: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const apply = (change: Partial<Filters>) => start(() => router.push(searchHref({ ...filters, ...change, page: 1 }, 1, utm), { scroll: false }));
  return { apply, pending };
}

function Option({ id, children, count }: { id: string; children: React.ReactNode; count?: number }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-[0.94rem] hover:bg-paper has-data-checked:font-semibold">
      {children}
      {count !== undefined ? <span className="ml-auto text-xs text-ink-soft tabular">{count.toLocaleString("en-GB")}</span> : null}
    </label>
  );
}

export function FilterPanel({ filters, counts, fields, utm }: PanelProps) {
  const { apply, pending } = useApply(filters, utm);
  // The panel renders twice (sidebar and phone sheet), so its ids need a per-instance prefix.
  const uid = useId();
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const active = activeFilterCount(filters);

  return (
    <div aria-busy={pending || undefined} className={cn("space-y-6 transition-opacity", pending && "opacity-60")}>
      <fieldset>
        <legend className="mb-2 px-2 font-semibold">Field of work</legend>
        <RadioGroup value={filters.field ?? ""} onValueChange={(v) => apply({ field: (v as Filters["field"]) || undefined })} className="gap-0.5">
          {["", ...fields].map((f) => (
            <Option key={f || "all"} id={`${uid}-field-${f || "all"}`} count={f ? (counts[f] ?? 0) : all}>
              <RadioGroupItem id={`${uid}-field-${f || "all"}`} value={f} />
              {f ? FIELD_LABEL[f] : "All fields"}
            </Option>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset>
        <legend className="mb-2 px-2 font-semibold">Jobs to show</legend>
        <div className="space-y-0.5">
          <Option id={`${uid}-grad`}>
            <Checkbox id={`${uid}-grad`} checked={filters.gradSchemes} onCheckedChange={(c) => apply({ gradSchemes: c })} />
            Graduate schemes only
          </Option>
          <Option id={`${uid}-entry`}>
            <Checkbox id={`${uid}-entry`} checked={filters.entryLevel} onCheckedChange={(c) => apply({ entryLevel: c })} />
            Graduate and entry level only
          </Option>
          <Option id={`${uid}-show-all`}>
            <Checkbox id={`${uid}-show-all`} checked={filters.show === "all"} onCheckedChange={(c) => apply({ show: c ? "all" : "passes" })} />
            Include jobs to check with the employer
          </Option>
          <Option id={`${uid}-senior`}>
            <Checkbox id={`${uid}-senior`} checked={filters.includeSenior} onCheckedChange={(c) => apply({ includeSenior: c })} />
            Include senior roles
          </Option>
        </div>
      </fieldset>

      {active > 0 ? (
        <Link
          href={searchHref({ ...filters, field: undefined, show: "passes", includeSenior: false, gradSchemes: false, entryLevel: false }, 1, utm)}
          scroll={false}
          className="inline-block px-2 text-sm font-semibold text-teal underline-offset-4 hover:underline"
        >
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}

/** Phones: the same panel in a sheet from the bottom, behind a button that says how many filters are on. */
export function MobileFilters(props: PanelProps & { total: number }) {
  const active = activeFilterCount(props.filters);
  return (
    <Sheet>
      <SheetTrigger className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3.5 text-[0.94rem] font-semibold hover:border-ink-soft lg:hidden">
        <SlidersHorizontalIcon aria-hidden className="size-4" />
        Filters{active ? ` (${active})` : ""}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85svh] rounded-t-xl bg-white p-0">
        <SheetHeader className="border-b border-line px-5 py-4">
          <SheetTitle className="font-expanded text-base font-extrabold">Filters</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-3 py-2">
          <FilterPanel {...props} />
        </div>
        <SheetFooter className="border-t border-line p-4">
          <SheetClose className="h-12 w-full rounded-md bg-ink font-semibold text-white hover:bg-ink/90">
            Show {props.total.toLocaleString("en-GB")} {props.total === 1 ? "job" : "jobs"}
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const SORT_LABEL: Record<Sort, string> = { best: "Best match", newest: "Newest", salary: "Highest salary" };

export function SortSelect({ filters, utm }: { filters: Filters; utm: string }) {
  const { apply } = useApply(filters, utm);
  return (
    <Select value={filters.sort} onValueChange={(v) => apply({ sort: (v as Sort) ?? "best" })} items={SORT_LABEL}>
      <SelectTrigger aria-label="Sort jobs" className="h-10 min-w-[10.5rem] bg-white text-[0.94rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
          <SelectItem key={s} value={s}>
            {SORT_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
