"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "dictation-banner-dismissed";

export function DictationBanner() {
  // Default visible. We start hidden only to avoid a flash before we can read
  // localStorage on the client, then reveal unless the user previously dismissed it.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) !== "true") {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setVisible(false);
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
