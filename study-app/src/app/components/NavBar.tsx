"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export function NavBar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // Don't show nav on login page
  if (pathname === "/login") return null;

  // Don't show while loading or if not logged in
  if (loading || !user) return null;

  return (
    <>
      {!user.hasApiKey && pathname !== "/settings" && (
        <div className="bg-fail/15 border-b border-fail/30">
          <div className="max-w-4xl mx-auto px-6 py-2 flex items-center justify-between">
            <p className="text-xs text-fail font-medium">
              You need to add your Anthropic API key to use this app.
            </p>
            <Link href="/settings" className="text-xs text-fail font-semibold hover:underline shrink-0 ml-4">
              Add key &rarr;
            </Link>
          </div>
        </div>
      )}
    <nav className="border-b border-border bg-card/50">
      <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="shrink-0">
            <Image src="/logo.png" alt="BWC" width={28} height={28} />
          </Link>
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
            href="/stem-sniper"
            className={`text-sm font-medium transition-colors ${
              pathname === "/stem-sniper"
                ? "text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            Stem Sniper
          </Link>
          <Link
            href="/live-tasting"
            className={`text-sm font-medium transition-colors ${
              pathname.startsWith("/live-tasting")
                ? "text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            Live Tasting
          </Link>
          <Link
            href="/diagrams"
            className={`text-sm font-medium transition-colors ${
              pathname.startsWith("/diagrams")
                ? "text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            Diagrams
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
          {/* "Fill the Bank" lives INSIDE the Admin settings card (per spec), reached via the
              user-menu Admin link and the NotificationBell "ready to review" entry — never as its
              own top-level nav tab or page. Methodology, Settings and Admin sit in the user menu on
              the right, so this row is the study surfaces only. */}
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </nav>
    </>
  );
}
