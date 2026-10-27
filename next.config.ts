import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones on the home Wi-Fi use the dev server (e.g. http://192.168.1.16:3000).
  allowedDevOrigins: ["192.168.*.*"],
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
