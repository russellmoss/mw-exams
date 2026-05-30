"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface UseSpeechResult {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

// The browser's SpeechRecognition ends a session on its own after a pause or a
// long run, even with `continuous = true`. If we don't restart it, dictation
// silently dies mid-answer (the "cut off at ~3500 words" bug). This hook keeps
// dictation going for as long as the user wants by transparently starting a
// fresh session whenever the browser ends one — while still letting a real
// user-initiated stop (or a permission failure) end it for good.
export function useSpeech(onTranscript: (text: string) => void): UseSpeechResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // True while the user wants to keep dictating. Lets us tell a user stop apart
  // from the browser auto-ending a session, so we only restart in the latter case.
  const shouldListenRef = useRef(false);
  // Consecutive hard failures (not no-speech). Bounds runaway restart loops if
  // the mic/network is genuinely broken; reset whenever we get real speech.
  const errorCountRef = useRef(0);
  // Keep the latest callback without re-wiring recognition handlers each render.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // Stable launcher held in a ref so onend can restart without a dependency cycle.
  // Defined once in an effect (not during render) — it closes only over refs and
  // stable state setters, so it never goes stale.
  const launchRef = useRef<() => void>(() => {});
  useEffect(() => {
    launchRef.current = () => {
      const SpeechRecognitionCtor =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) return;
      // A fresh instance per session — restarting a stopped one throws InvalidStateError.
      const recognition = new SpeechRecognitionCtor();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const chunk = result[0].transcript.trim();
            if (chunk) {
              errorCountRef.current = 0; // real speech — clear the failure counter
              onTranscriptRef.current(chunk);
            }
          }
        }
        // Show interim results for visual feedback
        let interim = "";
        for (let i = 0; i < event.results.length; i++) {
          if (!event.results[i].isFinal) {
            interim += event.results[i][0].transcript;
          }
        }
        setTranscript(interim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // Permission denial is fatal — stop for real, don't loop trying to restart.
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          shouldListenRef.current = false;
          setIsListening(false);
          console.error("Speech recognition error:", event.error);
          return;
        }
        // "no-speech" is normal during thinking pauses — never count it as a failure.
        if (event.error !== "no-speech" && event.error !== "aborted") {
          errorCountRef.current += 1;
          console.error("Speech recognition error:", event.error);
        }
      };

      recognition.onend = () => {
        setTranscript("");
        // Browser ended the session. If the user still wants to dictate and we
        // aren't in a hard-failure loop, transparently start a new session.
        if (shouldListenRef.current && errorCountRef.current < 5) {
          // Small delay so the previous instance fully releases before we restart.
          window.setTimeout(() => {
            if (shouldListenRef.current) {
              try {
                launchRef.current();
              } catch {
                shouldListenRef.current = false;
                setIsListening(false);
              }
            }
          }, 200);
          return;
        }
        shouldListenRef.current = false;
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    };
  }, []);

  const start = useCallback(() => {
    if (!isSupported || shouldListenRef.current) return;
    shouldListenRef.current = true;
    errorCountRef.current = 0;
    launchRef.current();
    setIsListening(true);
  }, [isSupported]);

  const stop = useCallback(() => {
    // Mark intent first so the in-flight onend doesn't auto-restart.
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setTranscript("");
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (shouldListenRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  // Stop cleanly if the component unmounts mid-dictation.
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  return { isListening, isSupported, transcript, start, stop, toggle };
}
