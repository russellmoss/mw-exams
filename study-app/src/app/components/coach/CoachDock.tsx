"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useFeedbackPanelState } from "@/lib/feedback-context";
import { CoachChat, type VoiceStatusCallback } from "./CoachChat";
import { VoiceHeaderOrb } from "./voice/VoiceHeaderOrb";
import type { VoiceState } from "@/lib/voice/state-types";

// Same hidden surfaces as the Feedback tab: unauthenticated and shared screens.
const HIDDEN_EXACT = new Set(["/login", "/forgot-password", "/reset-password", "/onboarding"]);
function isHidden(pathname: string): boolean {
  if (HIDDEN_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/shop")) return true;
  return false;
}

export interface DockRect {
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const MARGIN = 12;
const BASE_W = 420;
const BASE_H = 580;
const STORAGE_KEY = "mw-coach-dock";

function defaultRect(): DockRect {
  const w = typeof window === "undefined" ? BASE_W : window.innerWidth;
  const h = typeof window === "undefined" ? BASE_H : window.innerHeight;
  return {
    right: 24,
    bottom: 24,
    width: Math.min(BASE_W, w * 0.94),
    height: Math.min(BASE_H, h * 0.8),
  };
}

/**
 * Keep the panel on screen and no smaller than its opening size.
 *
 * The minimum is the default rather than something tiny: a panel can be grown but never shrunk below
 * the size at which the conversation is still readable, which removes a whole class of "I dragged it
 * to nothing and now I can't find it" support question.
 */
function clamp(r: DockRect): DockRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const min = defaultRect();
  const width = Math.max(Math.min(min.width, vw - MARGIN * 2), Math.min(r.width, vw - MARGIN * 2));
  const height = Math.max(Math.min(min.height, vh - MARGIN * 2), Math.min(r.height, vh - MARGIN * 2));
  const right = Math.min(Math.max(MARGIN, r.right), Math.max(MARGIN, vw - width - MARGIN));
  const bottom = Math.min(Math.max(MARGIN, r.bottom), Math.max(MARGIN, vh - height - MARGIN));
  return { right, bottom, width, height };
}

function loadRect(): DockRect | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (["right", "bottom", "width", "height"].every((k) => typeof p[k] === "number")) {
      return p as DockRect;
    }
  } catch {
    /* corrupt or unavailable — fall back to the default */
  }
  return null;
}

function applyRect(el: HTMLElement | null, r: DockRect) {
  if (!el) return;
  el.style.right = `${r.right}px`;
  el.style.bottom = `${r.bottom}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
}

function CoachIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 3.5h8a2 2 0 012 2v6.8a5 5 0 01-2.2 4.15L12 19l-3.8-2.55A5 5 0 016 12.3V5.5a2 2 0 012-2z"
      />
      <path strokeLinecap="round" d="M9.5 8.5h5M9.5 11.5h3" />
    </svg>
  );
}

export function CoachDock() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Once opened, the chat stays mounted behind `hidden` so a collapse never loses the thread.
  const [everOpened, setEverOpened] = useState(false);
  const [rect, setRect] = useState<DockRect>(defaultRect);
  // Study-clock bookkeeping, inherited from the Feedback tab this dock replaced.
  //
  // Opening the Coach mid-question pauses the answer timer and resumes it on close. Without this,
  // stopping to report a broken question — or to work the tree with the Coach — would silently cost
  // exam minutes, which is precisely the thing that stops people reporting problems at all.
  const { timerRef } = useFeedbackPanelState();
  const pausedAtRef = useRef<number | null>(null);
  // Voice status, lifted from the chat so the orb can live in this title bar rather than covering
  // the conversation. `getLevel` is kept in a ref: it is read every animation frame by the canvas,
  // and holding it in state would re-render the dock at that rate.
  const [voiceState, setVoiceState] = useState<VoiceState | null>(null);
  const voiceLevelRef = useRef<() => number>(() => 0);
  const onVoiceStatus = useCallback<VoiceStatusCallback>((state, getLevel) => {
    voiceLevelRef.current = getLevel;
    setVoiceState(state);
  }, []);
  const readVoiceLevel = useCallback(() => voiceLevelRef.current(), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; x: number; y: number; start: DockRect } | null>(null);
  const liveRect = useRef<DockRect>(rect);

  const hidden = isHidden(pathname);

  // Restore the saved position on mount. Deliberately client-only: reading localStorage during
  // render would desync hydration.
  useEffect(() => {
    const saved = loadRect();
    if (saved) {
      const next = clamp(saved);
      liveRect.current = next;
      // Deliberate: the saved rect lives in localStorage and the clamp needs the real viewport, so
      // neither is knowable during the first render — reading them there would desync hydration.
      // Runs once on mount with an empty dep array, so it settles rather than cascading.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(next);
    }
  }, []);

  // A viewport that shrank (rotation, window resize) can strand the panel off-screen — re-clamp.
  useEffect(() => {
    const onResize = () => {
      const next = clamp(liveRect.current);
      liveRect.current = next;
      setRect(next);
      applyRect(panelRef.current, next);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [prevHidden, setPrevHidden] = useState(hidden);
  if (hidden !== prevHidden) {
    setPrevHidden(hidden);
    if (hidden && open) setOpen(false);
  }

  const persist = useCallback((r: DockRect) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
    } catch {
      /* private mode / quota — position just won't survive the session */
    }
  }, []);

  /**
   * Drag and resize are one loop; only which fields the delta touches differs.
   *
   * The panel is anchored by its bottom-right corner, so a positive dx moves it LEFT (right += -dx)
   * and growing extends up and to the left into open space — the corner the user grabbed stays put.
   *
   * During the drag the rect is written straight to the DOM and only committed to React state on
   * pointerup. The chat subtree is expensive, and re-rendering it on every pointermove made dragging
   * visibly stutter.
   */
  const onPointerDown = useCallback(
    (mode: "move" | "resize") => (e: React.PointerEvent) => {
      // Let buttons in the title bar behave like buttons.
      if (mode === "move" && (e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { mode, x: e.clientX, y: e.clientY, start: { ...liveRect.current } };
    },
    []
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const next =
      d.mode === "move"
        ? { ...d.start, right: d.start.right - dx, bottom: d.start.bottom - dy }
        : { ...d.start, width: d.start.width - dx, height: d.start.height - dy };
    const clamped = clamp(next);
    liveRect.current = clamped;
    applyRect(panelRef.current, clamped);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      setRect(liveRect.current);
      persist(liveRect.current);
    },
    [persist]
  );

  const pauseTimer = useCallback(() => {
    const c = timerRef.current;
    if (c && pausedAtRef.current === null) {
      pausedAtRef.current = Date.now();
      c.pause();
    }
  }, [timerRef]);

  const resumeTimer = useCallback(() => {
    const c = timerRef.current;
    pausedAtRef.current = null;
    if (c) c.resume();
  }, [timerRef]);

  const close = useCallback(() => {
    resumeTimer();
    setOpen(false);
    requestAnimationFrame(() => chipRef.current?.focus());
  }, [resumeTimer]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (loading || !user || hidden) return null;

  return (
    <>
      {!open && (
        <button
          ref={chipRef}
          type="button"
          aria-label="Open the Coach"
          aria-haspopup="dialog"
          onClick={() => {
            setOpen(true);
            setEverOpened(true);
            pauseTimer();
          }}
          className="fixed z-50 bottom-20 right-20 md:bottom-6 md:right-[9.5rem] flex items-center justify-center gap-1.5 rounded-full bg-card/90 backdrop-blur border border-border hover:border-accent text-muted hover:text-accent transition-colors cursor-pointer h-11 w-11 md:h-auto md:w-auto md:px-3.5 md:py-2"
        >
          <CoachIcon className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline text-[13px] font-medium">Coach</span>
        </button>
      )}

      {everOpened && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Coach"
          // Read by capture.ts: the dock removes itself from a screenshot, so the shot shows the
          // page the candidate is asking about rather than the panel they asked from.
          data-coach-surface
          hidden={!open}
          style={{
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }}
          className={`fixed z-50 flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden ${
            open ? "" : "pointer-events-none"
          }`}
        >
          <div
            onPointerDown={onPointerDown("move")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border cursor-move select-none touch-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CoachIcon className="w-4 h-4 text-accent shrink-0" />
              <span className="text-[13px] font-medium text-foreground truncate">Coach</span>
              {voiceState && <VoiceHeaderOrb state={voiceState} getLevel={readVoiceLevel} />}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={close}
                aria-label="Close the Coach"
                className="text-muted hover:text-foreground transition-colors cursor-pointer rounded-lg px-1.5 py-0.5 text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>

          <CoachChat onVoiceStatus={onVoiceStatus} />

          {/* Resize grip. Top-left because the panel is anchored bottom-right, so this is the corner
              that moves when the panel grows. */}
          <div
            onPointerDown={onPointerDown("resize")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden
            className="absolute top-0 left-0 h-5 w-5 cursor-nwse-resize touch-none"
          />
        </div>
      )}
    </>
  );
}
