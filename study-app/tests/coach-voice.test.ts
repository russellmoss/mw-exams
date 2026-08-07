import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VadDetector, BARGE_VAD_OPTIONS, echoAdjustedLevel } from "@/lib/voice/vad";
import { SentenceChunker } from "@/lib/voice/sentence-chunker";
import { AudioQueue } from "@/lib/voice/audio-queue";
import { toSpeakable } from "@/lib/voice/speech";
import { planSpeech, READ_ALOUD_MAX_CHUNK, READ_ALOUD_MAX_TOTAL } from "@/lib/voice/read-aloud";
import {
  micErrorMessage,
  orbShouldAnimate,
  voiceAnnouncement,
  voiceControlAvailability,
  voiceStatusLabel,
} from "@/lib/voice/inline-ui";
import type { VoiceState } from "@/lib/voice/state-types";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => fs.readFileSync(path.join(appDir, p), "utf8");

// ── Turn-taking ──────────────────────────────────────────────────────────────────────────────────
//
// The two failures worth guarding are opposites and both ruin the feature: cutting the candidate off
// mid-thought, and never deciding they have stopped.

describe("voice turn-taking", () => {
  /** Feed `ms` of audio at a constant level, 20ms per sample, returning every event emitted. */
  function feed(vad: VadDetector, level: number, ms: number, startAt = 0): string[] {
    const events: string[] = [];
    for (let t = startAt; t < startAt + ms; t += 20) {
      const e = vad.process(level, t);
      if (e !== "none") events.push(e);
    }
    return events;
  }

  it("ignores a cough — loud but too short to be a turn", () => {
    const vad = new VadDetector();
    feed(vad, 0.3, 100); // 100ms < minSpeechMs (250)
    const after = feed(vad, 0, 4000, 100);
    expect(after).not.toContain("finalize");
  });

  it("finalizes a short answer after the base hangover", () => {
    const vad = new VadDetector();
    const speech = feed(vad, 0.3, 600);
    expect(speech).toContain("speech-start");
    expect(speech).toContain("speech-confirmed");
    expect(feed(vad, 0, 2000, 600)).toContain("finalize");
  });

  it("gives a long, rambling turn MORE patience than a short one", () => {
    // The whole reason the hangover grows: someone eight seconds into a deduction pauses to think,
    // and a flat bar treats that as handing over.
    const shortTurn = new VadDetector();
    feed(shortTurn, 0.3, 600);
    const shortHangover = shortTurn.currentHangoverMs();

    const longTurn = new VadDetector();
    feed(longTurn, 0.3, 9000);
    expect(longTurn.currentHangoverMs()).toBeGreaterThan(shortHangover);
  });

  it("never lets the grown hangover run away", () => {
    const vad = new VadDetector();
    feed(vad, 0.3, 60_000);
    expect(vad.currentHangoverMs()).toBeLessThanOrEqual(3000);
  });

  it("holds the turn through a trailing-off syllable", () => {
    // Hysteresis: staying in speech takes less than starting it, so the decaying end of a word does
    // not start the silence clock early.
    const vad = new VadDetector();
    feed(vad, 0.3, 600);
    const quiet = feed(vad, 0.03, 400, 600); // below onset (0.04), above release (0.025)
    expect(quiet).not.toContain("finalize");
  });
});

describe("barge-in", () => {
  it("does not let the Coach interrupt itself on its own echo", () => {
    // Mic hears 0.12 while the Coach plays at 0.2. Discounted, that is under the barge bar, so the
    // Coach keeps talking rather than oscillating against itself.
    const adjusted = echoAdjustedLevel(0.12, 0.2);
    expect(adjusted).toBeLessThan(BARGE_VAD_OPTIONS.speechThreshold);
  });

  it("still lets the candidate cut through loud playback", () => {
    const adjusted = echoAdjustedLevel(0.35, 0.2);
    expect(adjusted).toBeGreaterThanOrEqual(BARGE_VAD_OPTIONS.speechThreshold);
  });

  it("clamps to zero rather than going negative", () => {
    expect(echoAdjustedLevel(0.01, 0.9)).toBe(0);
  });

  it("needs sustained speech, so a single bang cannot interrupt", () => {
    const vad = new VadDetector(BARGE_VAD_OPTIONS);
    const events: string[] = [];
    for (let t = 0; t < 200; t += 20) events.push(vad.process(0.5, t)); // 200ms < minSpeechMs (400)
    expect(events).not.toContain("speech-confirmed");
  });
});

// ── Sentence cutting ─────────────────────────────────────────────────────────────────────────────

describe("sentence chunking for speech", () => {
  it("emits a sentence as soon as it is complete", () => {
    const c = new SentenceChunker();
    expect(c.push("Riesling is the call. ")).toEqual(["Riesling is the call."]);
  });

  it("does not cut on a decimal", () => {
    const c = new SentenceChunker();
    expect(c.push("It sits at 12.5 percent alcohol and ")).toEqual([]);
  });

  it("does not cut on an abbreviation", () => {
    const c = new SentenceChunker();
    expect(c.push("Compare vs. the Mosel example and ")).toEqual([]);
  });

  it("holds an incomplete tail until flush", () => {
    const c = new SentenceChunker();
    c.push("The acid is the giveaway");
    expect(c.flush()).toBe("The acid is the giveaway");
    expect(c.flush()).toBeNull();
  });
});

// ── Markdown → speech ────────────────────────────────────────────────────────────────────────────

describe("toSpeakable", () => {
  it("strips the formatting the Coach writes for the eye", () => {
    const out = toSpeakable("## Verdict\n\n- **Riesling** — the `acid` gives it away\n");
    expect(out).not.toMatch(/[#*`]/);
    expect(out).toMatch(/Riesling/);
    expect(out).toMatch(/acid/);
  });

  it("keeps a link's label but never reads the URL", () => {
    const out = toSpeakable("See [the AWRI guidance](https://awri.com.au/x) on this.");
    expect(out).toContain("the AWRI guidance");
    expect(out).not.toContain("awri.com.au");
    expect(out).not.toContain("https");
  });

  it("says the wine units instead of spelling them", () => {
    expect(toSpeakable("6 g/L residual sugar")).toContain("grams per litre");
    expect(toSpeakable("30 mg/L free SO2")).toContain("milligrams per litre");
    expect(toSpeakable("30 mg/L free SO2")).toContain("sulphur dioxide");
    expect(toSpeakable("13.5%")).toContain("percent");
    expect(toSpeakable("served at 12°C")).toContain("degrees Celsius");
  });

  it("reads mark notation as a person would", () => {
    expect(toSpeakable("b) Identify the origin (4 x 10 marks)")).toContain("4 by 10 marks");
  });

  it("expands the paper shorthand", () => {
    expect(toSpeakable("This is a P1 question.")).toContain("Paper 1");
  });

  // Load-bearing: the client normalizes before POSTing and the speak route normalizes again.
  it("is idempotent, because it runs on both sides of the wire", () => {
    const samples = [
      "## Verdict\n\n- **Riesling** — 6 g/L RS, 12°C, 13.5%",
      "See [the AWRI](https://awri.com.au/x). It sits at 12.5 percent.",
      "b) Identify the origin (4 x 10 marks) on this P2 flight.",
    ];
    for (const s of samples) {
      const once = toSpeakable(s);
      expect(toSpeakable(once), s).toBe(once);
    }
  });

  it("survives an empty or absent reply", () => {
    expect(toSpeakable("")).toBe("");
    expect(toSpeakable(null as unknown as string)).toBe("");
  });
});

// ── Read-aloud planning ──────────────────────────────────────────────────────────────────────────

describe("planSpeech", () => {
  it("sends the first sentence alone, so audio starts fast", () => {
    const chunks = planSpeech("First one. Second one. Third one. Fourth one.");
    expect(chunks[0]).toBe("First one.");
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("never exceeds the speak route's own cap, which SLICES rather than rejects", () => {
    // A chunk over the route's 1500-char limit would be silently truncated mid-sentence and the
    // listener would never know a clause went missing.
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about Riesling.`).join(" ");
    for (const chunk of planSpeech(long)) {
      expect(chunk.length).toBeLessThanOrEqual(READ_ALOUD_MAX_CHUNK);
    }
  });

  it("caps total synthesis so one click cannot fan out into a huge bill", () => {
    const huge = Array.from({ length: 4000 }, (_, i) => `Sentence ${i}.`).join(" ");
    const total = planSpeech(huge).join(" ").length;
    expect(total).toBeLessThanOrEqual(READ_ALOUD_MAX_TOTAL);
  });

  it("returns nothing when there is nothing speakable", () => {
    expect(planSpeech("")).toEqual([]);
    expect(planSpeech("[link](https://x.com)".replace("link", ""))).toEqual([]);
  });
});

// ── Playback ordering ────────────────────────────────────────────────────────────────────────────

describe("AudioQueue", () => {
  it("plays strictly in order even when clips resolve out of order", async () => {
    const played: number[] = [];
    const q = new AudioQueue<number>(async (n) => {
      await new Promise((r) => setTimeout(r, n === 1 ? 30 : 1));
      played.push(n);
    });
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    await new Promise((r) => setTimeout(r, 120));
    expect(played).toEqual([1, 2, 3]);
  });

  it("does not wedge on a failing clip", async () => {
    const played: number[] = [];
    const q = new AudioQueue<number>(async (n) => {
      if (n === 2) throw new Error("synthesis failed");
      played.push(n);
    });
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    await new Promise((r) => setTimeout(r, 50));
    expect(played).toEqual([1, 3]);
  });

  it("reports drained exactly once, and never after stop", async () => {
    let drained = 0;
    const q = new AudioQueue<number>(async () => {}, () => drained++);
    q.enqueue(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(drained).toBe(1);

    q.stop();
    q.enqueue(2);
    await new Promise((r) => setTimeout(r, 30));
    expect(drained).toBe(1);
  });
});

// ── Route + wiring guards ────────────────────────────────────────────────────────────────────────

describe("voice routes", () => {
  const speak = read("src/app/api/coach/speak/route.ts");
  const transcribe = read("src/app/api/coach/transcribe/route.ts");

  it("both require a session", () => {
    for (const [name, src] of [["speak", speak], ["transcribe", transcribe]] as const) {
      expect(src, name).toMatch(/getUser\(request\)/);
      expect(src, name).toMatch(/status: 401/);
    }
  });

  it("synthesis goes through the logged helper, so the Cost dashboard stays correct", () => {
    expect(speak).toMatch(/synthesizeSpeech/);
    // A direct fetch would bypass logElevenLabsUsage.
    expect(speak).not.toMatch(/api\.elevenlabs\.io/);
  });

  it("re-normalizes text server-side rather than trusting the client", () => {
    expect(speak).toMatch(/toSpeakable\(raw\)/);
  });

  it("bounds both payloads", () => {
    expect(speak).toMatch(/MAX_TEXT/);
    expect(transcribe).toMatch(/MAX_BYTES/);
    expect(transcribe).toMatch(/status: 413/);
  });

  it("does not return the upstream error body to the client", () => {
    // An ElevenLabs error body can carry account detail; it belongs in the log, not the response.
    expect(transcribe).toMatch(/error: "Transcription failed\."/);
  });

  it("pins the STT language rather than auto-detecting", () => {
    // Auto-detect hallucinates a foreign-language transcript on near-silence, which then gets asked
    // as if the candidate had said it.
    expect(read("src/lib/voice/transcribe.ts")).toMatch(/language_code/);
  });
});

// ── Inline presentation decisions ────────────────────────────────────────────────────────────────
//
// These are pure precisely because no voice COMPONENT can be tested here (no jsdom), so the
// judgment calls are pulled out where they can be.

describe("inline voice presentation", () => {
  it("names every state, including the one that says 'I heard you'", () => {
    const states: VoiceState[] = ["idle", "listening", "transcribing", "thinking", "speaking", "error"];
    for (const s of states) {
      expect(voiceStatusLabel(s), s).toBeTruthy();
    }
    // `transcribing` exists so "I heard you" and "I'm working on it" are not the same word.
    expect(voiceStatusLabel("transcribing")).not.toBe(voiceStatusLabel("thinking"));
  });

  it("only animates the orb while audio is actually flowing", () => {
    // Pinned in the dock title bar it follows the user everywhere, so a permanently moving object
    // is exactly what DESIGN.md's no-decorative-animation rule forbids.
    expect(orbShouldAnimate("listening")).toBe(true);
    expect(orbShouldAnimate("speaking")).toBe(true);
    for (const s of ["idle", "transcribing", "thinking", "error"] as VoiceState[]) {
      expect(orbShouldAnimate(s), s).toBe(false);
    }
  });

  it("offers each turn control only when it would do something", () => {
    expect(voiceControlAvailability("listening")).toEqual({ canFinish: true, canInterrupt: false });
    expect(voiceControlAvailability("speaking")).toEqual({ canFinish: false, canInterrupt: true });
    expect(voiceControlAvailability("thinking")).toEqual({ canFinish: false, canInterrupt: false });
  });

  it("stays quiet through routine cycling, so one exchange is not four announcements", () => {
    const ctx = { turnCount: 3 };
    expect(voiceAnnouncement("listening", "transcribing", ctx)).toBeNull();
    expect(voiceAnnouncement("transcribing", "thinking", ctx)).toBeNull();
    expect(voiceAnnouncement("thinking", "speaking", ctx)).toBeNull();
    expect(voiceAnnouncement("speaking", "listening", ctx)).toBeNull();
  });

  it("announces the edges that carry information", () => {
    expect(voiceAnnouncement("idle", "listening", { turnCount: 0 })).toMatch(/Voice mode on/);
    // Confirms the loop round-trips, once, then stays quiet.
    expect(voiceAnnouncement("speaking", "listening", { turnCount: 1 })).toMatch(/Listening again/);
    expect(voiceAnnouncement("thinking", "error", { turnCount: 1 })).toMatch(/unavailable/i);
  });

  it("turns each mic failure into a different, actionable sentence", () => {
    const messages = ["NotAllowedError", "NotFoundError", "NotReadableError"].map((name) =>
      micErrorMessage(Object.assign(new Error("x"), { name }))
    );
    expect(new Set(messages).size).toBe(3);
    expect(messages[0]).toMatch(/address bar/);
    expect(messages[2]).toMatch(/Something else is using/);
    expect(micErrorMessage(null)).toBeTruthy();
  });
});

describe("voice UI wiring", () => {
  const chat = read("src/app/components/coach/CoachChat.tsx");
  const dock = read("src/app/components/coach/CoachDock.tsx");
  const orb = read("src/app/components/coach/voice/VoiceHeaderOrb.tsx");

  it("never covers the conversation", () => {
    // The first version swapped the whole panel for a big orb, which hid the answer being read
    // aloud. The transcript IS the caption stream; voice runs alongside it.
    expect(chat).not.toMatch(/if \(voiceOpen\) return/);
    expect(fs.existsSync(path.join(appDir, "src/app/components/coach/voice/VoicePanel.tsx"))).toBe(false);
  });

  it("draws the orb in the dock title bar, from lifted state", () => {
    expect(dock).toMatch(/<VoiceHeaderOrb/);
    expect(chat).toMatch(/statusCbRef\.current\?\.\(voiceOpen \? voiceState : null, voiceLevel\)/);
  });

  it("keeps the orb from swallowing the title bar's drag", () => {
    // The drag handler only bails on closest("button"); a <canvas> is not one.
    expect(orb).toMatch(/pointer-events-none/);
    expect(orb).toMatch(/aria-hidden/);
  });

  it("reads the audio level through a ref, not state", () => {
    // Holding it in state would re-render the whole dock at animation-frame rate.
    expect(dock).toMatch(/voiceLevelRef/);
  });

  it("turns Talk into End in place rather than swapping buttons", () => {
    // Same DOM node, so focus stays put and the composer row never reflows mid-sentence.
    expect(chat).toMatch(/voiceOpen \? closeVoice : openVoice/);
    expect(chat).toMatch(/aria-pressed=\{voiceOpen\}/);
  });

  it("gives every answer a speaker and a copy button", () => {
    expect(chat).toMatch(/<SpeakButton/);
    expect(chat).toMatch(/<CopyButton/);
  });

  it("copies the markdown the candidate actually saw", () => {
    expect(chat).toMatch(/navigator\.clipboard\.writeText\(text\)/);
  });

  it("never runs read-aloud and hands-free at the same time", () => {
    // Two Web Audio graphs on one speaker is two voices talking over each other with no clean stop.
    // Asserted on the SpeakButton's own disabled expression rather than a literal, so widening the
    // condition (it also gates on having a key) does not read as a regression.
    const speakBtn = chat.match(/<SpeakButton[\s\S]*?\/>/)?.[0] ?? "";
    expect(speakBtn).toMatch(/disabled=\{voiceOpen/);
    expect(chat).toMatch(/readAloud\.stop\(\)/);
  });

  it("routes a spoken turn through the same send as a typed one", () => {
    // Forking a second send path would mean two places to keep the conversation bookkeeping right.
    expect(chat).toMatch(/send\(message, \{ onDelta \}\)/);
  });

  it("streams deltas unbatched so speech can start mid-answer", () => {
    const streamHook = read("src/lib/use-progress-stream.ts");
    expect(streamHook).toMatch(/opts\?\.onDelta\?\.\(event\.delta\)/);
  });
});
