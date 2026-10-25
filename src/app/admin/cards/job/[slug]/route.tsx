import { isAdmin } from "@/lib/admin/access";
import { jobCard } from "@/lib/admin/cards";
import { getJob } from "@/lib/site/queries";

const slideNumber = (v: string | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 20 ? n : null;
};

/** One job's Instagram slide as a PNG. `?i=2&of=10` adds the slide number. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdmin())) return new Response("Not found", { status: 404 });
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) return new Response("Unknown job", { status: 404 });
  const url = new URL(request.url);
  const index = slideNumber(url.searchParams.get("i"));
  const of = slideNumber(url.searchParams.get("of"));
  return jobCard(job, index && of && index <= of ? { index, of } : undefined);
}
