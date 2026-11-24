import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // shortcut: stock photos for the preview; swap for Supabase Storage when real gift photos arrive
    remotePatterns: [new URL("https://images.unsplash.com/**")],
  },
  experimental: {
    // Without this, a Server Component importing from the package root ships every client component.
    optimizePackageImports: ["@astryxdesign/core"],
  },
};

export default nextConfig;
