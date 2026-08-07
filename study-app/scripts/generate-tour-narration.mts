/**
 * Build the first-run tour's voice-over.
 *
 *   npm run narration:build              # only clips whose text changed
 *   npm run narration:build -- --force   # everything
 *   npm run narration:build -- intro-0 coach-3
 *
 * Reads src/lib/tour-narration.ts, synthesizes each clip with ElevenLabs, and writes
 * public/narration/<id>.mp3 plus public/narration/manifest.json. The manifest records the SHA-256 of
 * the text every clip was made from, which is what makes this incremental — and what
 * tests/tour-narration.test.ts checks, so text edited without a rebuild fails the build gate rather
 * than shipping a clip that says the old thing.
 *
 * NOT PART OF `prebuild`, deliberately. This spends real money against a real vendor key, and
 * `prebuild` runs on every Vercel deploy including ones that touch nothing here. The generated MP3s
 * are committed; the test is the gate. Run this by hand when you change the script, and commit the
 * audio with the copy.
 *
 * Voice and model are NOT configurable from the environment. `ELEVENLABS_VOICE_ID` is set in the
 * deployed environment to a superseded voice (see lib/elevenlabs.ts), and reading it here would mean
 * whoever rebuilds the narration next silently re-records the whole tour in the wrong voice. George
 * and `eleven_multilingual_v2` are pinned in code: George because the tour is a British institution
 * explained by a patient tutor, and multilingual_v2 because the script says Gewürztraminer, Grosses
 * Gewächs, cahiers des charges and Châteauneuf, which turbo and flash models mangle.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NARRATION_IDS, TOUR_NARRATION } from "../src/lib/tour-narration";
import { DEFAULT_ELEVENLABS_VOICE_ID } from "../src/lib/voices";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(APP_ROOT, "public", "narration");
const MANIFEST = join(OUT_DIR, "manifest.json");

const VOICE_ID = DEFAULT_ELEVENLABS_VOICE_ID; // George
const MODEL_ID = "eleven_multilingual_v2";
/**
 * 64 kbps, not the 128 the Coach's read-aloud uses. This is one narrator speaking, and the whole
 * tour is ~16 minutes of it: at 128 the twenty clips came to 15 MB of committed binary, and every
 * copy edit would add that again to git history forever. 64 halves it with no audible difference on
 * a single voice. Do not go to 22050_32 — the sibilants go glassy and the German and French terms
 * are the first thing to smear.
 */
const OUTPUT_FORMAT = "mp3_44100_64";

export interface NarrationManifestEntry {
  /** SHA-256 of the exact text this clip was synthesized from. The drift gate. */
  textHash: string;
  chars: number;
  bytes: number;
  voiceId: string;
  modelId: string;
}

export interface NarrationManifest {
  generatedAt: string;
  outputFormat: string;
  clips: Record<string, NarrationManifestEntry>;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Read .env.local the way the other standalone scripts do — Next loads it, plain Node does not. */
function elevenLabsKey(): string {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  for (const file of [".env.local", ".env"]) {
    try {
      const match = readFileSync(join(APP_ROOT, file), "utf8").match(
        /^ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m
      );
      // Trim a BOM/whitespace as well as quotes: a key written by PowerShell carries both, and a
      // stray ﻿ produces a 401 that looks exactly like a wrong key (see the env-BOM incident).
      if (match) return match[1].replace(/^﻿/, "").trim();
    } catch {}
  }
  return "";
}

function loadManifest(): NarrationManifest {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8")) as NarrationManifest;
  } catch {
    return { generatedAt: "", outputFormat: OUTPUT_FORMAT, clips: {} };
  }
}

async function synthesize(apiKey: string, text: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        // Matches lib/elevenlabs.ts so a clip sounds like the rest of the app's narration.
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => !a.startsWith("--"));

  const apiKey = elevenLabsKey();
  if (!apiKey) {
    console.error("✖ ELEVENLABS_API_KEY not set, and study-app/.env.local has no key either.");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = loadManifest();

  // Clips whose id has been removed from the script are dropped from the manifest; the orphan MP3 is
  // left on disk and reported, because deleting audio is not something a build script should do
  // unasked.
  for (const id of Object.keys(manifest.clips)) {
    if (!(id in TOUR_NARRATION)) {
      delete manifest.clips[id];
      console.log(`  orphan   ${id} — no longer in the script; delete public/narration/${id}.mp3`);
    }
  }

  const targets = (only.length ? only : NARRATION_IDS).filter((id) => {
    if (!(id in TOUR_NARRATION)) {
      console.error(`✖ unknown clip id: ${id}`);
      process.exit(1);
    }
    if (force || only.length) return true;
    const entry = manifest.clips[id];
    const file = join(OUT_DIR, `${id}.mp3`);
    return !entry || !existsSync(file) || entry.textHash !== hashText(TOUR_NARRATION[id]);
  });

  if (!targets.length) {
    console.log("✓ narration is up to date — nothing to synthesize.");
    return;
  }

  const totalChars = targets.reduce((sum, id) => sum + TOUR_NARRATION[id].length, 0);
  console.log(
    `Synthesizing ${targets.length} clip(s), ${totalChars.toLocaleString()} characters, ` +
      `voice ${VOICE_ID} (George), model ${MODEL_ID}.`
  );

  // Sequential on purpose. Twenty clips is a minute of wall-clock, and ElevenLabs rate-limits
  // concurrent synthesis per key — a parallel run fails halfway and leaves the manifest describing
  // clips that were never written.
  for (const id of targets) {
    const text = TOUR_NARRATION[id];
    process.stdout.write(`  ${id.padEnd(12)} ${String(text.length).padStart(5)} chars … `);
    let audio: Buffer;
    try {
      audio = await synthesize(apiKey, text);
    } catch (err) {
      console.log("FAILED");
      console.error(`✖ ${id}: ${err instanceof Error ? err.message : String(err)}`);
      // Write what did succeed, so a rerun resumes instead of starting over.
      writeManifest(manifest);
      process.exit(1);
    }
    writeFileSync(join(OUT_DIR, `${id}.mp3`), audio);
    manifest.clips[id] = {
      textHash: hashText(text),
      chars: text.length,
      bytes: audio.length,
      voiceId: VOICE_ID,
      modelId: MODEL_ID,
    };
    console.log(`${(audio.length / 1024).toFixed(0)} KB`);
  }

  writeManifest(manifest);
  const bytes = Object.values(manifest.clips).reduce((sum, c) => sum + c.bytes, 0);
  console.log(`✓ ${Object.keys(manifest.clips).length} clips, ${(bytes / 1024 / 1024).toFixed(1)} MB total.`);
}

function writeManifest(manifest: NarrationManifest) {
  const ordered: Record<string, NarrationManifestEntry> = {};
  for (const id of NARRATION_IDS) if (manifest.clips[id]) ordered[id] = manifest.clips[id];
  writeFileSync(
    MANIFEST,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), outputFormat: OUTPUT_FORMAT, clips: ordered },
      null,
      2
    ) + "\n"
  );
}

// Only when run as a command. Guarded so a test (or anything else) can import the helpers above
// without kicking off a paid synthesis run as a side effect of the import.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
