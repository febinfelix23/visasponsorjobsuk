"use server";

import { refresh } from "next/cache";
import { isStatus, removeSaved, SavedLimitError, savedJobIds, setStatus, toggleSaved } from "@/lib/account/saved";
import { getSessionUser } from "@/lib/auth/session";

const jobIdFrom = (v: unknown) => {
  const id = Number(v);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** The signed-in user's saved job IDs, or null when nobody is signed in. */
export async function savedJobIdsAction(): Promise<number[] | null> {
  const user = await getSessionUser();
  return user ? savedJobIds(user.id) : null;
}

export type ToggleResult = { saved: boolean } | { signIn: true } | { error: string };

export async function toggleSaveAction(jobId: number): Promise<ToggleResult> {
  const user = await getSessionUser();
  if (!user) return { signIn: true };
  const id = jobIdFrom(jobId);
  if (id === null) return { error: "That job couldn't be found." };
  try {
    return { saved: await toggleSaved(user.id, id) };
  } catch (error) {
    if (error instanceof SavedLimitError) return { error: error.message };
    throw error;
  }
}

/** The tracker's status select. */
export async function setStatusAction(form: FormData): Promise<void> {
  const user = await getSessionUser();
  const id = jobIdFrom(form.get("jobId"));
  const status = form.get("status");
  if (!user || id === null || !isStatus(status)) return;
  await setStatus(user.id, id, status);
  refresh();
}

export async function removeSavedAction(form: FormData): Promise<void> {
  const user = await getSessionUser();
  const id = jobIdFrom(form.get("jobId"));
  if (!user || id === null) return;
  await removeSaved(user.id, id);
  refresh();
}
