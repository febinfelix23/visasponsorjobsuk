import { jobIdFromCode } from "@/lib/site/short-link";
import { jobSlugById } from "@/lib/site/queries";

/**
 * Short links from social posts: /j/cc8 → /jobs/<slug>. Permanent, because a job's ID and
 * slug never change. An unknown code lands on the job search rather than an error.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const id = jobIdFromCode((await params).code);
  const slug = id ? await jobSlugById(id) : null;
  return Response.redirect(new URL(slug ? `/jobs/${slug}` : "/", request.url), slug ? 308 : 307);
}
