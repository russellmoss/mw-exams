"use client";

// Mobile bottom tab bar (docs/design/2026-08-06-shell-redesign/ §14): Home · Theory · Practical ·
// History · More, phone widths only. The desktop nav row hides on max-sm; this is its counterpart.
// "More" opens a small sheet with the remaining destinations (Library + the user-menu items).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const PRACTICAL_PREFIXES = ["/practical", "/live-tasting", "/study", "/flash-notes", "/stem-sniper", "/mikey"];

function TabIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75",
    theory: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897l12.682-12.68z",
    practical: "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z",
    history: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
    more: "M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name]} />
    </svg>
  );
}

export function MobileTabBar() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Navigation closes the sheet — reset during render off a previous-value marker, not in an effect
  // (see NavBar): an effect leaves the sheet open over the new page for a frame.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMoreOpen(false);
  }
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [moreOpen]);

  if (loading || !user || pathname === "/login") return null;

  const practicalActive = PRACTICAL_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const tabs = [
    { key: "home", label: "Home", href: "/", active: pathname === "/" },
    { key: "theory", label: "Theory", href: "/theory", active: pathname.startsWith("/theory") },
    { key: "practical", label: "Practical", href: "/practical", active: practicalActive },
    { key: "history", label: "History", href: "/history", active: pathname.startsWith("/history") },
  ];

  const moreItems = [
    { label: "Library", href: "/library" },
    { label: "Methodology", href: "/methodology" },
    // Question Review (migration 066) — two named reviewers only, gated server-side per route.
    ...(user.canReviewQuestions ? [{ label: "Question Review", href: "/review" }] : []),
    { label: "Settings", href: "/settings" },
    ...(user.isAdmin ? [{ label: "Admin", href: "/admin" }] : []),
  ];
  const moreActive = pathname.startsWith("/library") || pathname.startsWith("/diagrams") || pathname.startsWith("/methodology") || pathname.startsWith("/settings") || pathname.startsWith("/admin") || pathname.startsWith("/review");

  return (
    <>
      {/* Spacer so fixed bar never covers page content */}
      <div className="h-16 sm:hidden" />
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        {moreOpen && (
          <div ref={sheetRef} className="absolute bottom-full right-2 mb-2 w-52 rounded-xl border border-border bg-card py-2 shadow-[0_20px_40px_rgba(0,0,0,0.45)]">
            {moreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-4 py-2.5 text-sm text-foreground hover:bg-card-hover"
              >
                {item.label}
              </Link>
            ))}
            <button
              onClick={async () => {
                await logout();
                router.push("/login");
              }}
              className="block w-full text-left px-4 py-2.5 text-sm text-muted hover:bg-card-hover cursor-pointer"
            >
              Sign out
            </button>
          </div>
        )}
        <div className="grid grid-cols-5">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 ${
                tab.active ? "text-accent" : "text-muted"
              }`}
            >
              <TabIcon name={tab.key} />
              <span className="text-[0.625rem] font-medium">{tab.label}</span>
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 cursor-pointer ${
              moreActive || moreOpen ? "text-accent" : "text-muted"
            }`}
          >
            <TabIcon name="more" />
            <span className="text-[0.625rem] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
