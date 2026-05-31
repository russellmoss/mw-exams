import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* /diagrams is now a real Next route (src/app/diagrams/page.tsx) that embeds the prebuilt static
     site, so it no longer needs a rewrite. The sub-pages/assets stay static under public/diagrams/. */
};

export default nextConfig;
