// Theme constants shared by the client provider and the server-rendered pre-hydration script in
// layout.tsx. Deliberately NOT a "use client" module: every export of a client module becomes a
// client reference when a server component imports it, so the raw string would not survive.

export type Theme = "dark" | "light";

/** localStorage key holding the user's chosen theme. */
export const THEME_STORAGE_KEY = "mw-theme";

/** Fired on window whenever the theme changes, for non-React consumers (e.g. Mermaid re-render). */
export const THEME_CHANGE_EVENT = "mw-theme-change";

/**
 * The theme applied when the user has never toggled. Light since 2026-08-06 (owner decision) —
 * "Cellar" remains the dark-native design language, but first-time visitors land on the light
 * token set. See DESIGN.md decisions log.
 */
export const DEFAULT_THEME: Theme = "light";
