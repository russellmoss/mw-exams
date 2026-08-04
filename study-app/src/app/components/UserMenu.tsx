"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * The user's name in the top right, opening a menu of the account-level destinations — Admin (admin
 * users only), Settings, Methodology — plus Sign out. These used to sit inline in the main nav; they
 * live here so the left-hand nav stays the study surfaces only.
 */
export function UserMenu() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  // Stores the route the menu was opened on rather than a plain boolean, so navigating via one of
  // its links closes it as a derived consequence — no effect, no cascading render.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpenedOn(null);
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!user) return null;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.push("/login");
  };

  const itemClass = (href: string) =>
    `block w-full text-left px-4 py-2 text-xs font-medium transition-colors ${
      pathname === href
        ? "text-accent bg-accent/5"
        : "text-muted hover:text-foreground hover:bg-card-hover"
    }`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
          open ? "text-foreground bg-card-hover" : "text-muted hover:text-foreground"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="max-w-[10rem] truncate">{user.name}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-44 bg-card rounded-xl border border-border shadow-2xl z-50 overflow-hidden py-1"
        >
          {/* Navigating closes the menu via the derived `open` above; the explicit close here covers
              re-selecting the route you're already on, where the pathname never changes. */}
          {user.isAdmin && (
            <Link href="/admin" role="menuitem" className={itemClass("/admin")} onClick={() => setOpenedOn(null)}>
              Admin
            </Link>
          )}
          <Link href="/settings" role="menuitem" className={itemClass("/settings")} onClick={() => setOpenedOn(null)}>
            Settings
          </Link>
          <Link href="/methodology" role="menuitem" className={itemClass("/methodology")} onClick={() => setOpenedOn(null)}>
            Methodology
          </Link>
          <div className="my-1 border-t border-border" />
          <button
            onClick={handleLogout}
            role="menuitem"
            className="block w-full text-left px-4 py-2 text-xs font-medium text-muted hover:text-fail hover:bg-card-hover transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
