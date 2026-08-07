"use client";

// Hands-free conversation with the Coach: the turn loop behind the Talk button.
//
//   listening → thinking → speaking → listening → …
//
// Adapted from the Wine-inventory assistant's voice mode. The mic, playback, earcon and VAD parts
// are ports; the orchestration is rewritten because the Coach's turn is a different shape — an SSE
// stream that can run for minutes behind several tool calls, rather than a single quick completion.
//
// THREE THINGS THIS FILE IS RESPONSIBLE FOR, and each is a bug if it goes wrong:
//
//   TURN-TAKING. The VAD decides when the candidate has finished, with a hangover that GROWS with
//   how long they have been talking (see lib/voice/vad.ts) — someone mid-deduction pauses, and a
//   flat bar reads that as handing over. "Send now" is the manual override.
//
//   SPEAKING WHILE STILL THINKING. Sentences are cut from the token stream as it arrives and sent
//   to TTS one at a time, so the Coach starts talking a second or two in rather than after the whole
//   answer. A Coach turn can legitimately take a minute; waiting for it would feel broken.
//
//   NOT TALKING OVER ITSELF. While the Coach speaks, the mic stays open in barge-in mode with the
//   playback level fed in as an echo reference, so the candidate can cut in but the Coach cannot
//   interrupt itself on its own voice.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { micErrorMessage } from "@/lib/voice/inline-ui";
import { SentenceChunker } from "@/lib/voice/sentence-chunker";
import type { VoiceState } from "@/lib/voice/state-types";
import { toSpeakable } from "@/lib/voice/speech";
import { useAudioPlayback } from "./useAudioPlayback";
import { useEarcons } from "./useEarcons";
import { useMicCapture } from "./useMicCapture";

/** One exchange, for the transcript the panel shows. */
export interface VoiceTurn {
  role: "user" | "coach";
  text: string;
}

export type { VoiceState };

export interface VoiceSession {
  state: VoiceState;
  error: string | null;
  turns: VoiceTurn[];
  /** Live level for the orb: the mic while listening, the output while speaking. */
  getLevel: () => number;
  start: () => Promise<void>;
  stop: () => void;
  /** Hand the turn over now instead of waiting out the VAD hangover. */
  sendNow: () => void;
  /** Stop the Coach mid-sentence and start listening again. */
  interrupt: () => void;
}

/** What the caller must give us to actually ask the Coach something. */
export interface VoiceSessionOptions {
  /**
   * Send one message and stream the reply.
   *
   * `onDelta` must be called with each text delta as it arrives — that is what feeds the sentence
   * chunker. Resolves with the full final text (or null if the turn failed).
   */
  ask: (message: string, onDelta: (delta: string) => void) => Promise<string | null>;
  /** True while the caller considers the Coach unavailable (no API key, disabled). */
  disabled?: boolean;
}

async function fetchClip(text: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch("/api/coach/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Couldn't speak that.");
  }
  return res.arrayBuffer();
}

async function transcribe(audio: Blob, signal: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, "speech.webm");
  const res = await fetch("/api/coach/transcribe", { method: "POST", body: form, signal });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Couldn't hear that.");
  }
  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text.trim() : "";
}

export function useVoiceSession({ ask, disabled }: VoiceSessionOptions): VoiceSession {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);

  const mic = useMicCapture();
  // The drain callback is defined below (it has to reach `listen`), so it is routed through a ref
  // that an effect rebinds each render. useAudioPlayback re-stores whatever it is handed every
  // render, so the inline arrow costs nothing and keeps the hook's identity stable.
  const drainRef = useRef<() => void>(() => {});
  const playback = useAudioPlayback(() => drainRef.current());
  const earcons = useEarcons(playback.getContext);

  // The live session generation. Bumped by stop() and by every interrupt, so an in-flight turn that
  // has been superseded can tell and bail instead of resuming a conversation the user has left.
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  // Mirrors `state` for the callbacks that must read it live (getLevel runs every animation frame;
  // the drain handler fires from the audio queue). Synced in an effect — writing a ref during
  // render is what React's rules forbid.
  const stateRef = useRef<VoiceState>("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Mutually recursive: listen → handle → speak → listen. Each reaches the next through a ref that
  // an effect rebinds every render, which keeps the callbacks stable and the lint rules satisfied
  // without a forward declaration.
  const listenRef = useRef<() => void>(() => {});

  const setSafeState = useCallback((gen: number, next: VoiceState) => {
    if (genRef.current !== gen) return;
    setState(next);
  }, []);

  /**
   * The orb's level, switched by state.
   *
   * One getter rather than two so the visualizer never has to know which source is live: the mic
   * while the candidate talks, the TTS output while the Coach does.
   */
  const getLevel = useCallback(() => {
    if (stateRef.current === "speaking") return playback.levelRef.current;
    if (stateRef.current === "listening") return mic.levelRef.current;
    return 0;
  }, [mic.levelRef, playback.levelRef]);

  const teardown = useCallback(() => {
    genRef.current++;
    runningRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    earcons.stopThinking();
    playback.stopAll();
    mic.endTurn();
  }, [earcons, playback, mic]);

  const stop = useCallback(() => {
    teardown();
    mic.dispose();
    setState("idle");
    setError(null);
  }, [teardown, mic]);

  /** Speak one answer, sentence by sentence, then hand the turn back. */
  const speakAndResume = useCallback(
    async (gen: number, sentences: string[]) => {
      if (genRef.current !== gen) return;
      // Nothing speakable (a reply that was only a card, say) — go straight back to listening.
      if (sentences.length === 0) {
        listenRef.current();
        return;
      }
      setSafeState(gen, "speaking");

      // Barge-in: watch for the candidate talking over the answer, discounting our own playback so
      // the Coach cannot trigger it with its own voice.
      mic.beginBargeIn(
        () => {
          if (genRef.current !== gen) return;
          playback.stopAll();
          listenRef.current();
        },
        { getOutputLevel: () => playback.levelRef.current }
      );

      const controller = abortRef.current ?? new AbortController();
      for (const sentence of sentences) {
        if (genRef.current !== gen) return;
        playback.enqueue(fetchClip(sentence, controller.signal));
      }
    },
    [mic, playback, setSafeState]
  );

  const handleUtterance = useCallback(
    async (gen: number, audio: Blob) => {
      if (genRef.current !== gen) return;
      setSafeState(gen, "transcribing");
      earcons.startThinking();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const said = await transcribe(audio, controller.signal);
        if (genRef.current !== gen) return;
        // Scribe returns "" for a cough or a knock. Say nothing, just listen again — surfacing an
        // error for a non-utterance would make the session feel broken every time someone shifts.
        if (!said) {
          earcons.stopThinking();
          listenRef.current();
          return;
        }
        setTurns((prev) => [...prev, { role: "user", text: said }]);
        setSafeState(gen, "thinking");

        // Cut sentences off the token stream and queue each for synthesis as it completes, so the
        // Coach starts talking while it is still writing.
        const chunker = new SentenceChunker();
        const queued: string[] = [];
        let spokeFirst = false;

        const full = await ask(said, (delta) => {
          if (genRef.current !== gen) return;
          for (const sentence of chunker.push(delta)) {
            const speakable = toSpeakable(sentence).trim();
            if (!speakable) continue;
            queued.push(speakable);
            if (!spokeFirst) {
              // First complete sentence: stop the thinking bed and start talking.
              spokeFirst = true;
              earcons.stopThinking();
              setSafeState(gen, "speaking");
              mic.beginBargeIn(
                () => {
                  if (genRef.current !== gen) return;
                  playback.stopAll();
                  listenRef.current();
                },
                { getOutputLevel: () => playback.levelRef.current }
              );
            }
            playback.enqueue(fetchClip(speakable, controller.signal));
          }
        });

        if (genRef.current !== gen) return;
        earcons.stopThinking();

        if (full === null) {
          setError("That didn't go through. Try again.");
          setSafeState(gen, "error");
          return;
        }
        setTurns((prev) => [...prev, { role: "coach", text: full }]);

        // Whatever the chunker still holds (the last sentence, usually without a full stop).
        const tail = chunker.flush();
        const tailSpeakable = tail ? toSpeakable(tail).trim() : "";
        if (tailSpeakable) {
          if (!spokeFirst) {
            await speakAndResume(gen, [tailSpeakable]);
            return;
          }
          playback.enqueue(fetchClip(tailSpeakable, controller.signal));
        }

        // Nothing was ever speakable — resume rather than sit silent waiting for a drain that will
        // not come.
        if (!spokeFirst && !tailSpeakable) listenRef.current();
      } catch (err) {
        if (genRef.current !== gen) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        earcons.stopThinking();
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setSafeState(gen, "error");
      }
    },
    [ask, earcons, mic, playback, setSafeState, speakAndResume]
  );

  const listen = useCallback(() => {
    const gen = genRef.current;
    if (!runningRef.current) return;
    setSafeState(gen, "listening");
    mic.beginListen((audio) => {
      void handleUtterance(gen, audio);
    });
  }, [handleUtterance, mic, setSafeState]);

  useEffect(() => {
    listenRef.current = listen;
  });

  // Resume listening once the Coach has finished speaking. Registered as a drain callback rather
  // than awaited, because the queue keeps accepting sentences while it plays.
  useEffect(() => {
    drainRef.current = () => {
      if (!runningRef.current) return;
      if (stateRef.current !== "speaking") return;
      listenRef.current();
    };
  });

  const start = useCallback(async () => {
    if (disabled || runningRef.current) return;
    setError(null);
    setTurns([]);
    runningRef.current = true;
    const gen = ++genRef.current;
    try {
      // Both inside the click, so the autoplay policy and the mic prompt are satisfied together.
      await playback.ensureContext();
      await mic.ensureReady();
      earcons.preload();
    } catch (err) {
      runningRef.current = false;
      // Each failure mode has a different fix; micErrorMessage names it.
      setError(micErrorMessage(err));
      setState("error");
      return;
    }
    if (genRef.current !== gen) return;
    // The ready cue gates the mic: opening it under the cue would record the cue.
    earcons.playReady(() => {
      if (genRef.current !== gen || !runningRef.current) return;
      listenRef.current();
    });
  }, [disabled, earcons, mic, playback]);

  const sendNow = useCallback(() => {
    if (stateRef.current !== "listening") return;
    mic.finishListening();
  }, [mic]);

  const interrupt = useCallback(() => {
    if (!runningRef.current) return;
    abortRef.current?.abort();
    abortRef.current = null;
    earcons.stopThinking();
    playback.stopAll();
    mic.endTurn();
    genRef.current++;
    listenRef.current();
  }, [earcons, playback, mic]);

  useEffect(() => () => teardown(), [teardown]);

  return useMemo(
    () => ({ state, error, turns, getLevel, start, stop, sendNow, interrupt }),
    [state, error, turns, getLevel, start, stop, sendNow, interrupt]
  );
}
