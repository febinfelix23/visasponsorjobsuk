import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  cacheLife: {
    // Job, sponsor and listing pages. Jobs change when the scrapes run (twice a day), so
    // rebuilding them hourly only re-stored identical pages: each store is an ISR write,
    // billed per 8 KB, and crawlers revisit all ~12,000 pages.
    pages: {
      stale: 300, // 5 minutes in the browser
      revalidate: 43_200, // 12 hours
      expire: 172_800, // 2 days
    },
  },
  // The card and link-preview renderers read these font files at runtime.
  outputFileTracingIncludes: { "/admin/cards/**": ["./assets/fonts/*.ttf"], "/opengraph-image": ["./assets/fonts/*.ttf"], "/jobs/**": ["./assets/fonts/*.ttf"] },
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
