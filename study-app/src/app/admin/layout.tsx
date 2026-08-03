// The admin surface must never be served from a CDN/browser cache — a stale bundle here is what
// hid four prior "Fill the Bank" builds from the admin. Forcing the whole /admin segment dynamic
// (paired with the no-store Cache-Control headers in next.config for /admin and /api/admin) means
// every visit re-renders against the live build. This layout only carries that config; it adds no
// markup so the pages below are unchanged.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
