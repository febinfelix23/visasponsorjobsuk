import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The admin area, sign-in and the apply redirect have nothing to index.
      disallow: ["/admin", "/auth/", "/out/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
