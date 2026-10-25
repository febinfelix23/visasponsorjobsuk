import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site/config";
import { sitemapEntries, sponsorSlug } from "@/lib/site/queries";

/** Every page worth finding in search. Google's limit is 50,000 addresses per sitemap. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { jobs, sponsors } = await sitemapEntries();
  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/junior-doctors"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/how-we-check"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
  ];
  return [
    ...pages,
    ...jobs.map((j) => ({ url: absoluteUrl(`/jobs/${j.slug}`), lastModified: j.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...sponsors.map((s) => ({ url: absoluteUrl(`/sponsors/${sponsorSlug(s)}`), lastModified: s.updatedAt, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
