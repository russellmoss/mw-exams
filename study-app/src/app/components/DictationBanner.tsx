"use client";

import { useSyncExternalStore } from "react";

const DISMISS_KEY = "dictation-banner-dismissed";

// The dismissal lives in localStorage, which is an external store — so it is read with
// useSyncExternalStore rather than mirrored into component state by an effect.
//
// The old shape (start hidden, then setVisible(true) in a mount effect) existed to avoid a flash
// before localStorage could be read on the client. That is what useSyncExternalStore's
// getServerSnapshot does properly: the server and the hydration pass both render "dismissed", then
// React re-renders from the real client value. Same no-flash behaviour, no setState in an effect.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // `storage` covers OTHER tabs; the notify() in dismiss covers this one, because a same-tab
  // localStorage write does not fire the event.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

const isDismissed = () => localStorage.getItem(DISMISS_KEY) === "true";
// Hidden during SSR and hydration — the banner appears only once the real value is known.
const isDismissedOnServer = () => true;

export function DictationBanner() {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, isDismissedOnServer);

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    listeners.forEach((l) => l());
  };

  return (
    <div className="bg-fail/15 border-b border-fail/30">
      <div className="max-w-4xl mx-auto px-6 py-2 flex items-center justify-between gap-4">
        <p className="text-xs text-fail font-medium">
          If you want to use dictation, we highly suggest installing{" "}
          <a
            href="https://wisprflow.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:text-fail/80"
          >
            Wispr Flow
          </a>
          , as the native transcription on your computer is 🐶💩.{" "}
          <a
            href="https://wisprflow.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:text-fail/80"
          >
            https://wisprflow.ai/
          </a>
          . You&rsquo;re welcome.
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss dictation notice"
          className="text-fail hover:text-fail/70 text-sm font-bold leading-none shrink-0 cursor-pointer"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
