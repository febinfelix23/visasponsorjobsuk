"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Option = { label: string; value: string | null };

/**
 * The shadcn Select inside the account forms. `name` makes Base UI render a hidden input,
 * so the value submits with the form like any field. A null option is the placeholder
 * ("Choose a level"); offered as a choice too when `clearable` ("No second subject").
 */
export function FormSelect({
  id,
  name,
  options,
  groups,
  defaultValue,
  placeholder,
  clearable = false,
  invalid = false,
  onValueChange,
  className,
}: {
  id: string;
  name: string;
  options?: Option[];
  /** Grouped options, shown under a label each (degree subjects by broad area). */
  groups?: { label: string; options: Option[] }[];
  defaultValue?: string | null;
  placeholder: string;
  clearable?: boolean;
  invalid?: boolean;
  onValueChange?: (value: string | null) => void;
  className?: string;
}) {
  const flat = groups ? groups.flatMap((g) => g.options) : (options ?? []);
  const items: Option[] = [{ label: placeholder, value: null }, ...flat];
  const none = clearable ? (
    <SelectItem value={null} className="text-ink-soft">
      {placeholder}
    </SelectItem>
  ) : null;

  return (
    <Select name={name} items={items} defaultValue={defaultValue ?? null} onValueChange={(v) => onValueChange?.(v as string | null)}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        // The trigger's own height sits under data-[size=default], which a plain h-11 can't override.
        className={cn("w-full bg-white text-base data-[size=default]:h-11", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {groups ? (
          <>
            {none ? <SelectGroup>{none}</SelectGroup> : null}
            {groups.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </>
        ) : (
          <SelectGroup>
            {none}
            {flat.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
