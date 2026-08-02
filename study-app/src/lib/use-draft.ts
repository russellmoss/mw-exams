"use client";

import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

const PREFIX = "mw-draft:";

// If localStorage is unavailable (private mode, storage blocked) writes still
// have to land somewhere or the box would appear frozen. Drafts then live for
// the tab's lifetime instead of forever — degraded, not broken.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab editing the same draft is a change too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(storageKey: string): string {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) return stored;
  } catch {}
  return memory.get(storageKey) ?? "";
}

function write(storageKey: string, value: string) {
  memory.set(storageKey, value);
  try {
    if (value) window.localStorage.setItem(storageKey, value);
    else window.localStorage.removeItem(storageKey);
  } catch {}
  notify();
}

// Unsent text the user typed into a box. Closing a modal, switching threads,
// navigating away or reloading the tab all wipe React state, which silently
// throws away a half-written message — so the text lives in localStorage and
// comes back when the same box reopens.
//
// `key` scopes the draft: pass something stable and unique per conversation or
// form (e.g. "feature-request:42"). Changing the key swaps in that key's draft.
// The value is read through useSyncExternalStore so the server snapshot is
// empty and hydration can't mismatch.
//
// Drop-in for useState<string>, updater function included — that form reads
// straight back out of storage, so appends (dictation, say) can't clobber each
// other by closing over a stale value.
export function useDraft(key: string): [string, Dispatch<SetStateAction<string>>, () => void] {
  const storageKey = PREFIX + key;
  const value = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    () => ""
  );

  const set = useCallback<Dispatch<SetStateAction<string>>>(
    (next) => write(storageKey, typeof next === "function" ? next(read(storageKey)) : next),
    [storageKey]
  );
  const clear = useCallback(() => set(""), [set]);

  return [value, set, clear];
}
