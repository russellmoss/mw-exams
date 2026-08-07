"use client";

// Sends a signed-in user with no usable keys back to /onboarding.
//
// WHY A GATE AND NOT JUST THE ONBOARDING SCREEN. A Google sign-up lands on /onboarding, but nothing
// keeps them there — a bookmark, the back button, or typing a URL walks straight past it into an app
// where every generate, grade and search fails with a 402 they cannot interpret. The email/password
// form can refuse to create the account at all; this is the equivalent backstop for OAuth.
//
// DELIBERATELY CLIENT-SIDE. The alternative is middleware, which would mean a database read on every
// navigation to answer a question that changes about twice in an account's lifetime. The auth
// context already carries the answer, so the gate is free.
//
// This is a REDIRECT, not a block: it never renders anything, and it never hides page content that
// has already painted. Someone mid-render sees their page and is then moved, which is the honest
// behaviour for something that is a setup step rather than a permission failure.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Routes that must never redirect.
 *
 * `/settings` is here on purpose: it is the other place keys can be added, and bouncing someone out
 * of it would make a recoverable state unrecoverable. `/onboarding` obviously. The rest are
 * unauthenticated or shared surfaces where the gate has no business.
 */
const EXEMPT_EXACT = new Set([
  "/onboarding",
  "/settings",
  "/login",
  "/forgot-password",
  "/reset-password",
]);

function isExempt(pathname: string): boolean {
  if (EXEMPT_EXACT.has(pathname)) return true;
  // Public share surfaces, and the API routes answer for themselves.
  return pathname.startsWith("/shop") || pathname.startsWith("/api");
}

export function RequireKeysGate() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || isExempt(pathname)) return;
    // `hasTavilyKey` is optional on the type for older clients; treat only an explicit false as
    // missing, so a stale response can never lock someone out of their own app.
    const missingRequired = !user.hasApiKey || user.hasTavilyKey === false;
    if (missingRequired) router.replace("/onboarding");
  }, [loading, user, pathname, router]);

  return null;
}
