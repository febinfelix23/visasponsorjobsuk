import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
