"use client";

/**
 * sessionStorage as a React external store, for values another page wrote before navigating here.
 *
 * The pattern this replaces: initialise state to a default, then read storage in a mount effect and
 * setState. That paints the default first, needs an extra render pass, and is what
 * react-hooks/set-state-in-effect flags.
 *
 * A lazy `useState` initialiser is not a substitute — sessionStorage does not exist during SSR, so
 * the server would render the default while the client's first render used the stored value, and
 * hydration would mismatch. useSyncExternalStore is built for exactly this split: React renders
 * `getServerSnapshot` on the server and during hydration, then re-renders with the client value.
 *
 * Only for values this page READS. A value the page also owns and updates belongs in state.
 */

/**
 * No-op subscribe. These keys are written by a different page before navigation and never change
 * while the reading page is mounted, so there is nothing to listen to — but useSyncExternalStore
 * requires a subscribe function, and React still re-reads the snapshot on each render.
 */
export function subscribeToSessionStorage(): () => void {
  return () => {};
}

/** Returns null on the server, where sessionStorage does not exist. */
export function readSessionValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Safari private mode and similar can throw on access.
    return null;
  }
}
