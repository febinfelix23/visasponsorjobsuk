"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, type DeleteState } from "@/app/account/actions";

/** Deleting is permanent, so it opens a typed confirmation first. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-lg border border-stamp-red/40 bg-white px-4 font-semibold text-stamp-red hover:bg-stamp-wash">
        Delete my account
      </button>
    );
  }
  return (
    <form action={action} className="rounded-lg border border-stamp-red/40 bg-stamp-wash p-4">
      <p className="font-semibold text-stamp-red">This deletes your profile, saved jobs and settings straight away. It can&apos;t be undone.</p>
      <label htmlFor="confirm" className="mt-3 block text-[0.94rem]">
        Type <strong>DELETE</strong> to confirm
      </label>
      <input
        id="confirm"
        name="confirm"
        autoComplete="off"
        aria-invalid={!!state?.error || undefined}
        className="mt-1.5 h-11 w-full max-w-xs rounded-lg border border-line bg-white px-3 text-base"
      />
      {state?.error ? <p className="mt-1.5 text-sm font-semibold text-stamp-red">{state.error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="h-11 rounded-lg bg-stamp-red px-4 font-semibold text-white hover:bg-stamp-red/90 disabled:opacity-70">
          {pending ? "Deleting…" : "Delete my account"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-lg border border-line bg-white px-4 font-semibold">
          Keep my account
        </button>
      </div>
    </form>
  );
}
