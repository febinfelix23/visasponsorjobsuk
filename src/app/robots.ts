import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site/config";

/**
 * SEO-tool crawlers fetch every page to sell rankings data and send no visitors, while
 * each page they fetch can be a billed ISR write. They honour robots.txt, so they're
 * turned away; search engines (Google, Bing and others) stay welcome.
 */
const SEO_TOOL_BOTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot", "serpstatbot", "SeekportBot", "PetalBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The admin area, sign-in and the apply redirect have nothing to index.
        disallow: ["/admin", "/auth/", "/out/"],
      },
      { userAgent: SEO_TOOL_BOTS, disallow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
