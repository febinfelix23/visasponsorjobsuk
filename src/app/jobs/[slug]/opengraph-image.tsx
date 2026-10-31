import { SHARE_SIZE, shareCard } from "@/lib/admin/cards";
import { getJob } from "@/lib/site/queries";

export const alt = "The job and its Skilled Worker sponsorship check";
export const size = SHARE_SIZE;
export const contentType = "image/png";

/** The preview when a job link is shared: title, employer and the sponsorship stamp (once the ad is read). */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const job = await getJob((await params).slug);
  if (!job) return shareCard({ title: "This job has closed", subtitle: "Search current jobs at UK visa sponsors" });
  return shareCard({ title: job.title, subtitle: [job.employerName, job.locationText].filter(Boolean).join(", "), status: job.read ? job.sponsorability : undefined });
}
