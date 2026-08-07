"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

// Two-pillar IA (docs/design/2026-08-06-shell-redesign/): Theory · Practical (flyout) · Library ·
// History. Practical covers every tasting surface — the hub, the Dry Flights wizard and its
// session/drill screens, Live Tastings, and the unlisted Stem Sniper page. Library covers the
// diagrams (old /diagrams path included, for bookmarks).
const PRACTICAL_PREFIXES = ["/practical", "/live-tasting", "/study", "/flash-notes", "/stem-sniper", "/mikey"];

function linkClass(active: boolean) {
  return `text-sm font-medium transition-colors ${active ? "text-accent" : "text-muted hover:text-foreground"}`;
}

export function NavBar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Close the flyout on outside click and on navigation.
  useEffect(() => {
    if (!flyoutOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(event.target as Node)) {
        setFlyoutOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [flyoutOpen]);
  // Navigation closes the flyout. Reset DURING render off a previous-value marker rather than in an
  // effect: an effect would paint the new page with the old flyout still open for one frame, and
  // React flags synchronous setState in an effect body as a cascading render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setFlyoutOpen(false);
  }

  // Don't show nav on login page
  if (pathname === "/login") return null;

  // Don't show while loading or if not logged in
  if (loading || !user) return null;

  const practicalActive = PRACTICAL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const libraryActive = pathname.startsWith("/library") || pathname.startsWith("/diagrams");

  return (
    <>
      {!user.hasApiKey && pathname !== "/settings" && (
        <div className="bg-fail/15 border-b border-fail/30">
          <div className="max-w-5xl mx-auto px-6 py-2 flex items-center justify-between">
            <p className="text-xs text-fail font-medium">
              You need to add your Anthropic API key to use this app.
            </p>
            <Link href="/settings" className="text-xs text-fail font-semibold hover:underline shrink-0 ml-4">
              Add key &rarr;
            </Link>
          </div>
        </div>
      )}
    <nav data-tour="nav" className="border-b border-border bg-card/50">
      <div className="max-w-5xl mx-auto px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <Link href="/" className="shrink-0">
            <Image src="/logo.png" alt="BWC" width={28} height={28} />
          </Link>
          <Link href="/theory" className={`${linkClass(pathname.startsWith("/theory"))} max-sm:hidden`}>
            Theory
          </Link>
          <div ref={flyoutRef} className="relative flex items-center gap-1 max-sm:hidden">
            <Link href="/practical" className={linkClass(practicalActive)}>
              Practical
            </Link>
            <button
              type="button"
              aria-label="Practical drills"
              aria-expanded={flyoutOpen}
              onClick={() => setFlyoutOpen((open) => !open)}
              className="p-0.5 text-muted hover:text-foreground cursor-pointer"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={`transition-transform duration-150 ${flyoutOpen ? "rotate-180" : ""}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {flyoutOpen && (
              <div className="absolute left-0 top-full mt-2 w-[230px] rounded-xl border border-border bg-card py-2 shadow-[0_20px_40px_rgba(0,0,0,0.45)] z-40">
                <Link href="/practical/dry-flights" className="block px-4 py-2 hover:bg-card-hover">
                  <span className="block text-xs font-medium text-foreground">Dry Flights</span>
                  <span className="block text-xs text-muted mt-0.5">Simulated exam flights — no wine</span>
                </Link>
                <Link href="/live-tasting" className="block px-4 py-2 hover:bg-card-hover">
                  <span className="block text-xs font-medium text-foreground">Live Tastings</span>
                  <span className="block text-xs text-muted mt-0.5">Real bottles, timed event</span>
                </Link>
              </div>
            )}
          </div>
          <Link href="/library" className={`${linkClass(libraryActive)} max-sm:hidden`}>
            Library
          </Link>
          <Link href="/history" className={`${linkClass(pathname.startsWith("/history"))} max-sm:hidden`}>
            History
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <span data-tour="bell" className="flex">
            <NotificationBell />
          </span>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </nav>
    </>
  );
}
