"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteAccount,
  deleteEducation,
  deleteExperience,
  LimitReachedError,
  saveEducation,
  saveExperience,
  savePreferences,
} from "@/lib/account/data";
import { getSessionUser } from "@/lib/auth/session";
import { entryId, type Errors, type Parsed, parseEducation, parseExperience, parsePreferences } from "@/lib/profile/validate";
import { createClient } from "@/lib/supabase/server";

/** What a dialog's form gets back: done (close it) or the problems to show. */
export type FormState = { ok?: true; errors?: Errors; message?: string } | null;

/** Every action starts here: the user comes from the verified session, never from the form. */
async function signedInUser() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account");
  return user;
}

async function save<T>(parsed: Parsed<T>, write: (value: T) => Promise<boolean | void>): Promise<FormState> {
  if (!parsed.ok) return { errors: parsed.errors, message: "Check the highlighted answers." };
  try {
    if ((await write(parsed.value)) === false) return { message: "That entry no longer exists. Close this and try again." };
  } catch (error) {
    if (error instanceof LimitReachedError) return { message: error.message };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function saveEducationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await signedInUser();
  return save(parseEducation(form), (v) => saveEducation(user.id, entryId(form), v));
}

export async function saveExperienceAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await signedInUser();
  return save(parseExperience(form), (v) => saveExperience(user.id, entryId(form), v));
}

export async function savePreferencesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await signedInUser();
  return save(parsePreferences(form), (v) => savePreferences(user.id, v));
}

export async function deleteEntryAction(form: FormData): Promise<void> {
  const user = await signedInUser();
  const id = entryId(form);
  if (id === null) return;
  if (form.get("kind") === "education") await deleteEducation(user.id, id);
  else if (form.get("kind") === "experience") await deleteExperience(user.id, id);
  refresh();
}

export type DeleteState = { error?: string } | null;

/** Deletes the account after the user types DELETE, then signs them out. */
export async function deleteAccountAction(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const user = await signedInUser();
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm." };
  await deleteAccount(user.id);
  // The session's user no longer exists; clear its cookies too.
  await (await createClient()).auth.signOut().catch(() => {});
  redirect("/?account=deleted");
}
