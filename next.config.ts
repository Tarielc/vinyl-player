import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spotify rejects "localhost" redirect URIs, so the app is opened at 127.0.0.1.
  // The dev server only trusts localhost by default; without this, HMR and
  // dev assets (e.g. /__nextjs_font/*) are blocked with 403.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
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
