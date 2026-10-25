import { connection } from "next/server";
import { isAdmin } from "@/lib/admin/access";
import { coverCard } from "@/lib/admin/cards";

/** The carousel's first slide as a PNG: `?count=9&date=24 October`. */
export async function GET(request: Request) {
  // Never prerendered: access is decided per request.
  await connection();
  if (!(await isAdmin())) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const count = Math.min(Math.max(Number(url.searchParams.get("count")) || 0, 0), 20);
  const date = (url.searchParams.get("date") ?? "").replace(/[^\w ]/g, "").slice(0, 20);
  return coverCard({ count, date });
}
