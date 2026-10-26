"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useActionState } from "react";
import type { FormState } from "@/app/account/actions";
import { deleteEntryAction } from "@/app/account/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Errors } from "@/lib/profile/validate";
import { cn } from "@/lib/utils";

export const control =
  "h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink outline-none focus-visible:border-teal focus-visible:ring-3 focus-visible:ring-teal/25 aria-invalid:border-stamp-red";

export function Label({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[0.94rem] font-semibold">
      {children}
      {optional ? <span className="font-normal text-ink-soft"> (optional)</span> : null}
    </label>
  );
}

export function FieldMessage({ id, errors, name }: { id: string; errors?: Errors; name: string }) {
  return errors?.[name] ? (
    <p id={id} className="mt-1.5 text-sm font-semibold text-stamp-red">
      {errors[name]}
    </p>
  ) : null;
}

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

/** The form inside an open dialog: mounted fresh on every open, so old errors never linger. */
function DialogForm({ action, onDone, submitLabel, children }: { action: Action; onDone: () => void; submitLabel: string; children: (errors?: Errors) => React.ReactNode }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await action(prev, form);
    if (result?.ok) onDone();
    return result;
  }, null);
  return (
    <form action={formAction} noValidate className="grid gap-5">
      {state?.message && !state.ok ? (
        <p role="alert" className="rounded-lg border border-stamp-red bg-stamp-wash p-3 text-[0.94rem] font-semibold text-stamp-red">
          {state.message}
        </p>
      ) : null}
      {children(state?.errors)}
      <DialogFooter className="-mx-6 -mb-6 mt-1 rounded-b-xl border-t border-line bg-paper px-6 py-4 sm:justify-end">
        <DialogClose render={<Button type="button" variant="outline" className="h-11 px-4 text-[0.94rem]" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending} className="h-11 px-5 text-[0.94rem] font-semibold">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  submitLabel = "Save",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  action: Action;
  submitLabel?: string;
  children: (errors?: Errors) => React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] gap-5 overflow-y-auto bg-white p-6 text-ink sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-semi-expanded text-lg font-bold">{title}</DialogTitle>
          {description ? <DialogDescription className="text-ink-soft">{description}</DialogDescription> : null}
        </DialogHeader>
        {open ? (
          <DialogForm action={action} onDone={() => onOpenChange(false)} submitLabel={submitLabel}>
            {children}
          </DialogForm>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** An entry on the account page: click it, or its edit button, to change it. */
export function EntryCard({
  icon,
  title,
  lines,
  onEdit,
  deleteLabel,
  entry,
}: {
  icon: React.ReactNode;
  title: string;
  lines: (string | null)[];
  onEdit: () => void;
  deleteLabel: string;
  entry: { kind: "education" | "experience"; id: number };
}) {
  return (
    <li className="group relative flex items-start gap-4 rounded-lg border border-line bg-white p-4 transition-colors hover:border-ink-soft/60 sm:p-5">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-lg border border-teal/25 bg-teal-wash text-teal [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-snug">
          {/* The whole card opens the editor; the buttons sit above this layer. */}
          <button type="button" onClick={onEdit} className="text-left after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none group-hover:underline group-hover:decoration-teal group-hover:underline-offset-4 [&:focus-visible]:after:ring-3 [&:focus-visible]:after:ring-teal/40">
            {title}
          </button>
        </h3>
        {lines.filter(Boolean).map((l, i) => (
          <p key={i} className={cn("text-ink-soft", i === 0 ? "mt-0.5 text-[0.94rem]" : "mt-0.5 text-sm tabular")}>
            {l}
          </p>
        ))}
      </div>
      <div className="relative z-10 -mr-1 flex shrink-0 gap-0.5">
        <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${title}`} className="size-9 text-ink-soft hover:text-ink">
          <PencilIcon />
        </Button>
        <DeleteEntry label={deleteLabel} title={title} entry={entry} />
      </div>
    </li>
  );
}

function DeleteEntry({ label, title, entry }: { label: string; title: string; entry: { kind: "education" | "experience"; id: number } }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Delete ${title}`} className="size-9 text-ink-soft hover:bg-stamp-wash hover:text-stamp-red" />}>
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-white text-ink">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-semi-expanded font-bold">{label}</AlertDialogTitle>
          <AlertDialogDescription className="text-ink-soft">&ldquo;{title}&rdquo; will be removed from your profile and your matches.</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={deleteEntryAction}>
          <input type="hidden" name="kind" value={entry.kind} />
          <input type="hidden" name="id" value={entry.id} />
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 px-4">Keep it</AlertDialogCancel>
            <Button type="submit" className="h-10 bg-stamp-red px-4 font-semibold text-white hover:bg-stamp-red/90">
              Delete
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
