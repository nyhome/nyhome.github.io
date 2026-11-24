import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for GitHub Pages: data lives in Firestore, read and written from the browser.
  output: "export",
  images: {
    // No image server on Pages; with unoptimized, any host works (gift photos are store URLs).
    unoptimized: true,
  },
  experimental: {
    // Without this, a Server Component importing from the package root ships every client component.
    optimizePackageImports: ["@astryxdesign/core"],
  },
};

export default nextConfig;
