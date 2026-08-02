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

// null means "no draft for this key", which is not the same as a draft the user
// deliberately emptied — that one is stored as "" so it wins over any initial
// value the caller seeds the box with.
function read(storageKey: string): string | null {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) return stored;
  } catch {}
  return memory.has(storageKey) ? memory.get(storageKey)! : null;
}

function write(storageKey: string, value: string) {
  memory.set(storageKey, value);
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {}
  notify();
}

function forget(storageKey: string) {
  memory.delete(storageKey);
  try {
    window.localStorage.removeItem(storageKey);
  } catch {}
  notify();
}

// Unsent text the user typed into a box. Closing a modal, switching threads,
// navigating away or reloading the tab all wipe React state, which silently
// throws away a half-written message — so the text lives in localStorage and
// comes back when the same box reopens.
//
// `key` scopes the draft: pass something stable and unique per conversation,
// question or record (e.g. "answer:2024_p1_q3"). Changing the key swaps in that
// key's draft. `initial` is what the box shows when no draft exists yet — pass
// the saved server value for a box that edits something already persisted.
// The value is read through useSyncExternalStore so the server snapshot is
// empty and hydration can't mismatch.
//
// Drop-in for useState<string>, updater function included — that form reads
// straight back out of storage, so appends (dictation, say) can't clobber each
// other by closing over a stale value. The third element forgets the draft
// entirely, which is what you want once the text has been submitted.
export function useDraft(
  key: string,
  initial = ""
): [string, Dispatch<SetStateAction<string>>, () => void] {
  const storageKey = PREFIX + key;
  const stored = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    () => null
  );
  const value = stored ?? initial;

  const set = useCallback<Dispatch<SetStateAction<string>>>(
    (next) => write(storageKey, typeof next === "function" ? next(read(storageKey) ?? initial) : next),
    [storageKey, initial]
  );
  const clear = useCallback(() => forget(storageKey), [storageKey]);

  return [value, set, clear];
}
