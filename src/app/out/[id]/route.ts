import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clicks, jobs } from "@/lib/db/schema";

const clean = (v: string | null) => (v ? v.replace(/[^\w.-]/g, "").slice(0, 40) || null : null);

/**
 * Apply link: records the click (job and UTM tags only; no IP or user agent), then
 * sends the person to the original ad. Runs per request, never cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) return new Response("Unknown job", { status: 404 });

  const db = getDb();
  const [job] = await db.select({ applyUrl: jobs.applyUrl }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return new Response("Unknown job", { status: 404 });

  let target: URL;
  try {
    target = new URL(job.applyUrl);
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("bad protocol");
  } catch {
    return new Response("This job's link is invalid", { status: 502 });
  }

  const url = new URL(request.url);
  // Losing a click count must never block someone from reaching the ad.
  await db
    .insert(clicks)
    .values({
      jobId,
      utmSource: clean(url.searchParams.get("utm_source")),
      utmMedium: clean(url.searchParams.get("utm_medium")),
      utmCampaign: clean(url.searchParams.get("utm_campaign")),
    })
    .catch(() => {});

  return Response.redirect(target.toString(), 302);
}
