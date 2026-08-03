"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useBankPending } from "@/lib/use-bank-pending";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

export function NavBar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // Admin-only "Bank" link carries an amber dot when there are generated questions waiting for
  // review. The count is polled (mount + every 60s, no-store) by the shared useBankPending hook, so
  // the NavBar and the UserMenu item stay in lock-step.
  const isAdmin = !!user?.isAdmin;
  const bankPending = useBankPending();

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
          {isAdmin && (
            <Link
              href="/admin/bank"
              className={`relative text-sm font-medium transition-colors ${
                pathname.startsWith("/admin/bank")
                  ? "text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Bank
              {bankPending > 0 && (
                <span
                  className="absolute -top-1 -right-2.5 w-2 h-2 rounded-full bg-accent"
                  aria-label={`${bankPending} waiting to review`}
                />
              )}
            </Link>
          )}
          {/* Methodology, Settings and Admin now live in the user menu on the right — this row is
              the study surfaces only. */}
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
