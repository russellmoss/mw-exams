"use client";

// Voice-over for the first-run tour: the intro presentation, the diagram walkthrough and the Coach
// walkthrough. One pre-generated MP3 per slide (src/lib/tour-narration.ts), autoplayed on slide
// entry, with a speaker button that mutes it.
//
// THE BUTTON IS HIDDEN UNTIL THE AUDIO IS PROVEN TO EXIST. `available` starts false and only turns
// true on `loadedmetadata` — so a missing file, a CDN failure, or a browser that cannot decode MP3
// leaves the header exactly as it was before this feature existed, with no dead control and no error
// state to explain. That is the requested behaviour, and it is also what makes the whole feature
// safe to ship: the worst case is silence.
//
// MUTING IS PAUSE/RESUME, NOT VOLUME. Real muting would let the clip run out silently, so unmuting
// three seconds later would drop the listener into the middle of a sentence they never heard. The
// preference is remembered in localStorage and applies to every subsequent slide and session, so
// muting once is muting for good.
//
// AUTOPLAY IS ALLOWED TO BE BLOCKED. The intro mounts at page load with no prior user gesture, which
// Chrome and Safari refuse. Rather than treating that as failure we retry on the first pointer or
// key event anywhere in the document — which, on a click-through presentation, is the user pressing
// "Next" or "Learn more" seconds later. The button stays visible and unmuted throughout, because the
// narration is not off, it is waiting.

import { useCallback, useEffect, useRef, useState } from "react";
import { narrationSrc } from "@/lib/tour-narration";

const MUTE_KEY = "mw-tour-narration-muted";

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {}
}

interface NarrationState {
  /** True only once the clip's metadata has loaded. Gates the button being rendered at all. */
  available: boolean;
  muted: boolean;
  playing: boolean;
  toggle: () => void;
}

export function useTourNarration(id: string, nextId?: string): NarrationState {
  // Lazy initializer rather than a mount effect, so the preference is known before the first
  // autoplay attempt and no setState happens in an effect body. Hydration-safe despite reading
  // localStorage: `muted` is only ever consulted inside the button, and the button cannot render
  // until `loadedmetadata` has fired — which is strictly after hydration.
  const [muted, setMuted] = useState(() => (typeof window === "undefined" ? false : readMuted()));
  // Readiness and playback are tracked as "which clip is it true of", not as booleans, so changing
  // slides resets them by derivation instead of by a setState in the effect body.
  const [readyId, setReadyId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The playback effect needs the current preference without re-running when it changes — a mute
  // must not tear down and re-create the element mid-clip.
  const mutedRef = useRef(muted);

  useEffect(() => {
    if (!id) return;
    // Per-invocation cancel token rather than a shared ref: under StrictMode this effect mounts,
    // tears down and mounts again, and a stale `play()` promise resolving into the second run's
    // state is how you get a button that says "playing" over silence.
    let cancelled = false;
    let detachGesture: (() => void) | undefined;

    const audio = new Audio(narrationSrc(id));
    audio.preload = "auto";
    audioRef.current = audio;

    const onReady = () => !cancelled && setReadyId(id);
    const onEnded = () => !cancelled && setPlayingId(null);
    const onError = () => {
      if (cancelled) return;
      setReadyId(null);
      setPlayingId(null);
    };
    audio.addEventListener("loadedmetadata", onReady);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    const attempt = () => {
      if (cancelled || mutedRef.current) return;
      audio.play().then(
        () => !cancelled && setPlayingId(id),
        (err: unknown) => {
          // NotAllowedError is the autoplay policy and is recoverable. Anything else (a 404 decoding
          // as NotSupportedError, say) is handled by the `error` listener hiding the button.
          if (cancelled || (err as DOMException | null)?.name !== "NotAllowedError") return;
          const retry = () => {
            detachGesture?.();
            detachGesture = undefined;
            attempt();
          };
          document.addEventListener("pointerdown", retry, { once: true, capture: true });
          document.addEventListener("keydown", retry, { once: true, capture: true });
          detachGesture = () => {
            document.removeEventListener("pointerdown", retry, true);
            document.removeEventListener("keydown", retry, true);
          };
        }
      );
    };
    attempt();

    return () => {
      cancelled = true;
      detachGesture?.();
      audio.removeEventListener("loadedmetadata", onReady);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      // Detach the source so the browser stops buffering a clip nobody is listening to.
      audio.removeAttribute("src");
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [id]);

  // Warm the next slide's clip into the HTTP cache. These are a few hundred KB each and a slide is
  // on screen for the better part of a minute, so by the time Next is pressed the audio is local.
  useEffect(() => {
    if (!nextId) return;
    fetch(narrationSrc(nextId)).catch(() => {});
  }, [nextId]);

  const toggle = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    writeMuted(next);
    const audio = audioRef.current;
    if (!audio) return;
    if (next) {
      audio.pause();
      setPlayingId(null);
    } else {
      // Resuming inside a click handler means the autoplay policy cannot refuse it.
      audio.play().then(
        () => setPlayingId(id),
        () => {}
      );
    }
  }, [id]);

  return { available: readyId === id, muted, playing: playingId === id, toggle };
}

/**
 * The speaker control. Renders nothing at all when the clip could not be loaded.
 *
 * Sized and coloured to sit beside the "n / 6" counter in each tour header: muted stone by default,
 * amber while it is actually speaking, so the accent is doing its usual job of marking the one live
 * thing on screen rather than decorating a control.
 */
export function TourNarrationButton({
  id,
  nextId,
  className = "",
}: {
  id: string;
  nextId?: string;
  className?: string;
}) {
  const { available, muted, playing, toggle } = useTourNarration(id, nextId);
  if (!available) return null;

  const label = muted ? "Unmute narration" : "Mute narration";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={muted}
      title={label}
      className={`rounded-md p-1 transition-colors cursor-pointer ${
        muted ? "text-muted hover:text-foreground" : playing ? "text-accent" : "text-muted hover:text-foreground"
      } ${className}`}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* The cone, shared by both states. */}
        <path d="M11 5 6 9H3v6h3l5 4z" />
        {muted ? (
          <path d="M16.5 9.5l5 5m0-5l-5 5" />
        ) : (
          <>
            <path d="M15.5 8.8a4.5 4.5 0 010 6.4" />
            <path d="M18.5 6.2a8.5 8.5 0 010 11.6" />
          </>
        )}
      </svg>
    </button>
  );
}
