"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Poll the admin bank pending-review count for the amber nav dot (NavBar + UserMenu). Fetches on
 * mount and every 60s (spec cadence) with `no-store` so a cached response never hides a waiting
 * batch. Only admins ever hit the endpoint; non-admins short-circuit to 0 without a request.
 */
export function useBankPending(): number {
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [pending, setPending] = useState(0);

  useEffect(() => {
    // Non-admins never poll; `pending` stays at its 0 default (no synchronous setState in-effect).
    if (!isAdmin) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/admin/bank/pending-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setPending(Number(data.pending) || 0);
      } catch {
        /* transient — next poll retries */
      }
    };
    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [isAdmin]);

  return pending;
}
