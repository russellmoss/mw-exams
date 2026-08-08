#!/usr/bin/env tsx

/**
 * Writes a YouTube-ready `.srt` beside each tour video in `outputs/tour_videos/`.
 *
 *   npm run captions:build --prefix study-app
 *   npm run captions:build --prefix study-app -- --surface=coach
 *
 * IT READS THE SAME SOURCE THE AUDIO WAS MADE FROM. The cue text comes from `TOUR_NARRATION` in
 * src/lib/tour-narration.ts — the exact strings ElevenLabs spoke — so a caption cannot say something
 * the voice does not. Transcribing the audio back into text would reintroduce the drift the whole
 * narration pipeline is built to prevent.
 *
 * SLIDE BOUNDARIES ARE MEASURED OUT OF THE VIDEO, NOT ASSUMED. The obvious approach — add up the clip
 * durations and the recorder's nominal pad — is wrong by a little per slide (click latency, and the
 * animated Coach steps are slower to advance than the still ones), and being 2.5s adrift by the end
 * is exactly the failure captions are judged on. So this samples the progress-dot row at 10fps and
 * finds the frames where the active pill jumps: nothing else in that strip of the footer moves within
 * a slide, which makes it an unambiguous slide-change signal accurate to a tenth of a second.
 *
 * WITHIN a slide, cue timings are apportioned by character count, with an allowance for the pauses
 * ElevenLabs renders at paragraph breaks. That is an estimate — the only inputs that would beat it
 * are per-word timestamps from the vendor, which the pipeline does not keep. Each slide re-anchors on
 * a measured boundary, so any error is bounded inside one slide instead of accumulating over six
 * minutes; expect sub-second accuracy, which is well inside what captions need.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NARRATION_COUNTS, TOUR_NARRATION, narrationId, type NarrationSurface } from "../src/lib/tour-narration";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(APP_DIR, "..");
const NARRATION_DIR = path.join(APP_DIR, "public", "narration");
const VIDEO_DIR = path.join(REPO_ROOT, "outputs", "tour_videos");

/** Two lines of ~42 characters is the most a reader comfortably takes in per cue. */
const MAX_CUE_CHARS = 84;
const MAX_LINE_CHARS = 42;
/** Cues shorter than this are merged forward — a flash of text is worse than a slightly long one. */
const MIN_CUE_SECONDS = 0.9;
/** What a paragraph break costs in speech. Blank lines are pauses to ElevenLabs, not whitespace. */
const PARAGRAPH_PAUSE = 0.35;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "1"];
  })
);
const wanted = (args.get("surface") ?? Object.keys(NARRATION_COUNTS).join(",")).split(",") as NarrationSurface[];

// ── helpers ──────────────────────────────────────────────────────────────────

function runCapture(cmd: string, cmdArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { shell: process.platform === "win32", windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`))));
  });
}

async function duration(file: string): Promise<number> {
  return Number(await runCapture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]));
}

/**
 * Frames of the progress-dot strip, as raw 8-bit grey, at `fps`. Piped rather than written out: it is
 * ~16KB a frame and only consecutive differences matter.
 */
const STRIP = { w: 400, h: 40, x: 760, y: 1030, fps: 10 };

function stripFrames(video: string): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-v", "error",
        "-i", video,
        "-vf", `crop=${STRIP.w}:${STRIP.h}:${STRIP.x}:${STRIP.y},fps=${STRIP.fps},format=gray`,
        "-f", "rawvideo", "-pix_fmt", "gray", "-",
      ],
      { shell: process.platform === "win32", windowsHide: true }
    );
    const chunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg strip extraction exited ${code}`));
      const all = Buffer.concat(chunks);
      const size = STRIP.w * STRIP.h;
      const frames: Buffer[] = [];
      for (let offset = 0; offset + size <= all.length; offset += size) frames.push(all.subarray(offset, offset + size));
      resolve(frames);
    });
  });
}

/**
 * When each slide came on screen, in seconds. Slide 1 starts at 0 by definition (its clip begins after
 * the recorder's lead-in, which is handled by the caller).
 */
async function detectSlideChanges(video: string, slides: number): Promise<number[] | null> {
  const frames = await stripFrames(video);
  if (frames.length < 10) return null;

  const diffs = frames.slice(1).map((frame, i) => {
    const prev = frames[i];
    let sum = 0;
    for (let p = 0; p < frame.length; p += 4) sum += Math.abs(frame[p] - prev[p]); // every 4th pixel is plenty
    return sum / (frame.length / 4);
  });

  // Cluster everything meaningfully above the noise floor, then take each cluster's peak. A slide
  // change repaints the pill and often the button row, so it spans two or three sampled frames.
  const sorted = [...diffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(0.6, median + 0.5 * (sorted[Math.floor(sorted.length * 0.999)] - median));

  const peaks: number[] = [];
  let cluster: number[] = [];
  const flush = () => {
    if (!cluster.length) return;
    peaks.push(cluster.reduce((best, i) => (diffs[i] > diffs[best] ? i : best), cluster[0]));
    cluster = [];
  };
  diffs.forEach((value, i) => {
    if (value >= threshold) {
      if (cluster.length && i - cluster[cluster.length - 1] > STRIP.fps) flush();
      cluster.push(i);
    }
  });
  flush();

  if (peaks.length !== slides - 1) {
    console.warn(`  ! found ${peaks.length} slide changes, expected ${slides - 1} — falling back to nominal timing`);
    return null;
  }
  // +1 because diff i sits between frame i and i+1; the new slide is painted on the later frame.
  return [0, ...peaks.map((i) => (i + 1) / STRIP.fps)];
}

// ── cue text ─────────────────────────────────────────────────────────────────

interface Unit {
  text: string;
  /** Seconds of silence that precede this unit (a paragraph break in the script). */
  gapBefore: number;
}

function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_CUE_CHARS) return [sentence];
  // Prefer a clause boundary near the middle so a cue does not break mid-phrase.
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_CUE_CHARS) {
    const window = rest.slice(0, MAX_CUE_CHARS + 1);
    const clause = Math.max(window.lastIndexOf(", "), window.lastIndexOf(" — "), window.lastIndexOf("; "), window.lastIndexOf(": "));
    const cut = clause > MAX_CUE_CHARS * 0.45 ? clause + 1 : window.lastIndexOf(" ");
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function unitsFor(text: string): Unit[] {
  const units: Unit[] = [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  paragraphs.forEach((paragraph, pIndex) => {
    const sentences = paragraph.split(/(?<=[.!?])\s+/).flatMap(splitLongSentence);
    // Pack short sentences together up to the cue budget, so "Tier-one sources throughout. Not
    // Reddit." is one cue rather than two flashes.
    const packed: string[] = [];
    for (const sentence of sentences) {
      const last = packed[packed.length - 1];
      if (last && last.length + 1 + sentence.length <= MAX_CUE_CHARS) packed[packed.length - 1] = `${last} ${sentence}`;
      else packed.push(sentence);
    }
    packed.forEach((cue, i) => units.push({ text: cue, gapBefore: i === 0 && pIndex > 0 ? PARAGRAPH_PAUSE : 0 }));
  });
  return units;
}

function wrap(text: string): string {
  if (text.length <= MAX_LINE_CHARS) return text;
  const words = text.split(" ");
  const lines: string[] = [""];
  const target = Math.ceil(text.length / Math.ceil(text.length / MAX_LINE_CHARS));
  for (const word of words) {
    const line = lines[lines.length - 1];
    if (line && (line + " " + word).length > Math.max(target, MAX_LINE_CHARS)) lines.push(word);
    else lines[lines.length - 1] = line ? `${line} ${word}` : word;
  }
  return lines.join("\n");
}

function stamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

// ── main ─────────────────────────────────────────────────────────────────────

for (const surface of wanted) {
  const slides = NARRATION_COUNTS[surface];
  if (!slides) {
    console.error(`Unknown surface "${surface}"`);
    process.exit(1);
  }
  const video = path.join(VIDEO_DIR, `${surface}.mp4`);
  if (!existsSync(video)) {
    console.log(`${surface.padEnd(10)} no video yet — skipped`);
    continue;
  }

  const clips: number[] = [];
  for (let i = 0; i < slides; i++) clips.push(await duration(path.join(NARRATION_DIR, `${narrationId(surface, i)}.mp3`)));

  const videoSeconds = await duration(video);
  let starts = await detectSlideChanges(video, slides);
  let source = "measured from the video";
  if (!starts) {
    // Nominal fallback: distribute the unmodelled per-advance latency evenly, inferred from the
    // difference between the video's real length and what the clips plus pads account for.
    const NOMINAL_LEAD = 1.2, NOMINAL_PAD = 0.9, NOMINAL_TAIL = 2.5;
    const accounted = NOMINAL_LEAD + clips.reduce((a, b) => a + b, 0) + slides * NOMINAL_PAD + NOMINAL_TAIL;
    const latency = Math.max(0, (videoSeconds - accounted) / Math.max(1, slides - 1));
    starts = [NOMINAL_LEAD];
    for (let i = 1; i < slides; i++) starts.push(starts[i - 1] + clips[i - 1] + NOMINAL_PAD + latency);
    starts = starts.map((t) => t - NOMINAL_LEAD);
    source = "estimated";
  }

  // Detection returns slide-change times relative to the video; slide 1's speech begins after the
  // recorder's lead-in silence, which detection cannot see (nothing moves during it).
  const LEAD = 1.2;
  const slideAudioStart = starts.map((t, i) => (i === 0 ? LEAD : t));

  const lines: string[] = [];
  let index = 1;
  for (let i = 0; i < slides; i++) {
    const units = unitsFor(TOUR_NARRATION[narrationId(surface, i)] ?? "");
    const gaps = units.reduce((sum, u) => sum + u.gapBefore, 0);
    const chars = units.reduce((sum, u) => sum + u.text.length, 0);
    const speakable = Math.max(0.5, clips[i] - gaps);

    const cues: { start: number; end: number; text: string }[] = [];
    let cursor = slideAudioStart[i];
    for (const unit of units) {
      cursor += unit.gapBefore;
      const span = (unit.text.length / chars) * speakable;
      cues.push({ start: cursor, end: cursor + span, text: unit.text });
      cursor += span;
    }
    // Merge anything too brief to read into its neighbour, then emit. Forward first; then backward for
    // a short cue at the end of a slide, which has no successor to absorb it — that is how a
    // three-word closing sentence ("Not Reddit.") ends up on screen for a third of a second.
    for (let c = 0; c < cues.length; c++) {
      while (cues[c + 1] && cues[c].end - cues[c].start < MIN_CUE_SECONDS) {
        cues[c].text = `${cues[c].text} ${cues[c + 1].text}`;
        cues[c].end = cues[c + 1].end;
        cues.splice(c + 1, 1);
      }
    }
    while (cues.length > 1 && cues[cues.length - 1].end - cues[cues.length - 1].start < MIN_CUE_SECONDS) {
      const tail = cues.pop()!;
      const prev = cues[cues.length - 1];
      prev.text = `${prev.text} ${tail.text}`;
      prev.end = tail.end;
    }
    for (const cue of cues) {
      lines.push(String(index++), `${stamp(cue.start)} --> ${stamp(cue.end)}`, wrap(cue.text), "");
    }
  }

  const out = path.join(VIDEO_DIR, `${surface}.srt`);
  await fs.writeFile(out, lines.join("\n"), "utf8");
  console.log(`${surface.padEnd(10)} ${(index - 1).toString().padStart(3)} cues, boundaries ${source} → ${path.relative(REPO_ROOT, out)}`);
}
