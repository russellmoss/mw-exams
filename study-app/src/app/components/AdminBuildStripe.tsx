"use client";

import { useEffect, useState } from "react";

/**
 * Deliberately-unmissable build diagnostic, pinned to the very top of /admin.
 *
 * Four prior "Fill the Bank" builds reportedly never reached the admin's browser; cache/gating was
 * the prime suspect. This stripe is the ground truth: if the admin can read the current build stamp
 * below, the latest bundle is being served. It renders UNCONDITIONALLY for any authenticated user
 * who reaches /admin — never gated on isAdmin — because a gating bug is exactly what could hide it.
 *
 * It also fetches /api/auth/me itself (no-store) rather than trusting the page's auth context, so it
 * reports the live server truth of who you are and whether the DB still considers you an admin —
 * surfacing a silent admin-gating failure (a session that predates an isAdmin change).
 */

// Bump on every build so a stale bundle is obvious at a glance. Prefer an injected build time when
// the deploy provides one; otherwise this hardcoded stamp is updated in the shipping change.
const BUILD_NUMBER = 5;
const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_TIME || "2026-08-03T23:35Z";

export function AdminBuildStripe() {
  const [me, setMe] = useState<{ email: string; isAdmin: boolean } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.user) setMe({ email: data.user.email, isAdmin: !!data.user.isAdmin });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full border border-accent bg-card px-4 py-2 text-xs text-foreground leading-relaxed">
      <p>
        <span className="font-medium">Admin build {BUILD_NUMBER}</span> · Fill the Bank: ON — if you
        can read this, updates are reaching you.{" "}
        <span className="text-muted tabular-nums">Built {BUILD_STAMP}</span>
      </p>
      <p className="text-muted mt-0.5">
        {me
          ? `Signed in as ${me.email} · admin: ${me.isAdmin ? "true" : "false"}`
          : checked
            ? "Signed in as — · admin: unknown (not authenticated)"
            : "Checking session…"}
      </p>
    </div>
  );
}
