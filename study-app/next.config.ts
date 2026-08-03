import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* /diagrams is now a real Next route (src/app/diagrams/page.tsx) that embeds the prebuilt static
     site, so it no longer needs a rewrite. The sub-pages/assets stay static under public/diagrams/. */

  /* Cache-busting for the admin surface. Four prior builds reportedly never reached the admin's
     browser; a CDN/browser-cached admin HTML (or admin API JSON) is the prime suspect. Force
     no-store on every /admin page and /api/admin/* response so the admin always sees the live
     build — paired with `export const dynamic = 'force-dynamic'` in src/app/admin/layout.tsx. */
  async headers() {
    return [
      {
        source: "/admin",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
      },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
