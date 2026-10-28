import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones on the home Wi-Fi use the dev server (e.g. http://192.168.1.16:3000).
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  // Only the app's own pages may show it in a frame (the Director's Preview page); blocks other sites from embedding it.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
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
