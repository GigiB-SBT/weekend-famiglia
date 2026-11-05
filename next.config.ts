import type { NextConfig } from "next";

/** MOBILE_EXPORT=1 → static export in `out/` for the Android app (Capacitor). */
const mobile = process.env.MOBILE_EXPORT === "1";

const nextConfig: NextConfig = {
  // Build number (GitHub run) shown in the app and used by the in-app update check.
  env: { NEXT_PUBLIC_BUILD: process.env.GITHUB_RUN_NUMBER ?? "0" },
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
