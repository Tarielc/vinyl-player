import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy. Scripts need 'unsafe-inline' because Next.js inlines
// its bootstrap scripts into prerendered pages (nonces would force every page
// to render per request). The policy still blocks scripts, frames and fetches
// to any origin not listed here. React needs 'unsafe-eval' in development only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://sdk.scdn.co https://www.youtube.com`,
  "style-src 'self' 'unsafe-inline'",
  // Cover art comes from several Spotify and YouTube image hosts.
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  // blob: lets three.js read the textures embedded in the .glb models.
  "connect-src 'self' blob:",
  // Spotify's Web Playback SDK and the YouTube player run in these iframes.
  "frame-src https://sdk.scdn.co https://www.youtube.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // YouTube embeds refuse to play without at least the page's origin as referrer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Ignored over plain http, so harmless in local development.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
