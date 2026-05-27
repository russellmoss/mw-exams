"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function NavBar() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Don't show nav on login page
  if (pathname === "/login") return null;

  // Don't show while loading or if not logged in
  if (loading || !user) return null;

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <nav className="border-b border-border bg-card/50">
      <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className={`text-sm font-medium transition-colors ${
              pathname === "/"
                ? "text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            Study
          </Link>
          <Link
            href="/history"
            className={`text-sm font-medium transition-colors ${
              pathname === "/history"
                ? "text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            History
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-muted">
            {user.name}
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-muted hover:text-fail transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
