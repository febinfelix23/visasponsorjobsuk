"use client";

import { XIcon } from "lucide-react";
import { useTransition } from "react";
import { removeSavedAction, setStatusAction } from "@/app/account/jobs/actions";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ApplicationStatus, STATUSES } from "@/lib/account/statuses";

const items = STATUSES.map((s) => ({ label: s.label, value: s.value }));

/** Where the application stands; changing it saves straight away. */
export function StatusSelect({ jobId, status, title }: { jobId: number; status: ApplicationStatus; title: string }) {
  const [pending, start] = useTransition();
  const save = (value: string | null) => {
    if (!value) return;
    const form = new FormData();
    form.set("jobId", String(jobId));
    form.set("status", value);
    start(() => setStatusAction(form));
  };
  return (
    <Select items={items} defaultValue={status} onValueChange={(v) => save(v as string | null)} disabled={pending}>
      <SelectTrigger aria-label={`Application status for ${title}`} className="min-w-40 bg-white text-[0.94rem] font-semibold data-[size=default]:h-10">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function RemoveSaved({ jobId, title }: { jobId: number; title: string }) {
  return (
    <form action={removeSavedAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <button type="submit" aria-label={`Remove ${title} from your jobs`} title="Remove" className="inline-flex size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-stamp-wash hover:text-stamp-red">
        <XIcon aria-hidden className="size-4" />
      </button>
    </form>
  );
}
