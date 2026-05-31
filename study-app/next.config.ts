import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // The study-diagrams static site is prebuilt into public/diagrams/. Next doesn't serve a
      // directory index at /diagrams (and trailingSlash:false strips the slash from the NavBar's
      // /diagrams/ link), so the bare URL 404s in dev. Map it to the built index.html — works in
      // both `next dev` and on Vercel. The sub-pages/assets are absolute (/diagrams/*) and serve
      // directly as static files, so they need no rewrite.
      { source: "/diagrams", destination: "/diagrams/index.html" },
    ];
  },
};

export default nextConfig;
