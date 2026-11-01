import type { NextConfig } from "next";

/** MOBILE_EXPORT=1 → static export in `out/` for the Android app (Capacitor). */
const mobile = process.env.MOBILE_EXPORT === "1";

const nextConfig: NextConfig = {
  // Cache Components / partial prefetching are web-only: static export does not support PPR.
  ...(mobile
    ? { output: "export" as const, images: { unoptimized: true } }
    : { cacheComponents: true, partialPrefetching: true }),
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
