import { redirect } from "next/navigation";

/** The profile now lives on the account page; old links land there. */
export default function ProfilePage() {
  redirect("/account");
}
