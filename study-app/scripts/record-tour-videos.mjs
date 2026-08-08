#!/usr/bin/env node

/**
 * Records each first-run tour surface as a 1080p MP4 with its committed narration as the soundtrack —
 * shareable video (YouTube, a link to a study group) of the exact presentation the app plays.
 *
 *   node scripts/record-tour-videos.mjs                        # all five, light theme
 *   node scripts/record-tour-videos.mjs --surface=intro,coach   # a subset
 *   node scripts/record-tour-videos.mjs --theme=dark
 *
 * Output: ../outputs/tour_videos/<surface>.mp4 (gitignored — binaries, regenerable).
 *
 * REQUIREMENTS: ffmpeg + ffprobe on PATH, and `playwright` resolvable. Playwright is deliberately NOT
 * a devDependency: it is a ~400MB browser download that every Vercel build would install for a script
 * nobody runs in CI. Install it where you like (`npm i -g playwright`, or a scratch directory plus
 * NODE_PATH) — the script resolves it at runtime and says so if it cannot.
 *
 * HOW SYNC IS GUARANTEED, which is the only hard part here.
 *
 * The video is captured through CDP `Page.startScreencast`, which emits a frame only when the page
 * actually changes and stamps each one with the compositor's swap time. So the frame list IS a
 * timeline: frame i lasts until frame i+1's timestamp. Assembling with ffmpeg's concat demuxer and
 * those measured durations reproduces real time exactly, however unevenly the frames arrived — which
 * matters because these slides are static for forty seconds and then animate.
 *
 * The audio is then built to fit the video rather than the other way round. The script advances a
 * slide once its clip's duration has elapsed, records when that actually happened, and pads each clip
 * with silence to the slide's MEASURED on-screen time (`apad=whole_dur`). Click latency and dev-server
 * jitter therefore cannot accumulate into drift: every clip starts exactly when its slide appears,
 * because the padding is computed from what the recorder observed, not from what it intended.
 *
 * WHY IT DRIVES A DEV SERVER IT STARTS ITSELF. The stage route (`/tour-export/<surface>`) is gated on
 * NEXT_PUBLIC_TOUR_EXPORT, which is inlined at build time, so a production or preview build has no
 * such route. Spawning `next dev` with the flag set is what makes the surfaces reachable at all.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(APP_DIR, "..");
const NARRATION_DIR = path.join(APP_DIR, "public", "narration");
const OUT_DIR = path.join(REPO_ROOT, "outputs", "tour_videos");

/** Slide counts, mirrored from src/lib/tour-narration.ts. Asserted against the clips on disk. */
const SURFACES = {
  intro: { slides: 6, title: "The introduction" },
  diagrams: { slides: 7, title: "How the study diagrams work" },
  coach: { slides: 7, title: "Meet your Coach" },
  practical: { slides: 9, title: "The practical drills" },
  theory: { slides: 7, title: "Theory" },
};

// ── options ──────────────────────────────────────────────────────────────────

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "1"];
  })
);

const opts = {
  surfaces: (args.get("surface") ?? Object.keys(SURFACES).join(",")).split(",").filter(Boolean),
  theme: args.get("theme") === "dark" ? "dark" : "light",
  port: Number(args.get("port") ?? 3717),
  /** Silence before the first clip, so the opening animation is not already running under speech. */
  lead: Number(args.get("lead") ?? 1.2),
  /** Breathing room after each clip before the slide turns. */
  pad: Number(args.get("pad") ?? 0.9),
  /** How long the closing slide holds after its clip. */
  tail: Number(args.get("tail") ?? 2.5),
  fps: Number(args.get("fps") ?? 30),
  keepFrames: args.has("keep-frames"),
};

for (const surface of opts.surfaces) {
  if (!SURFACES[surface]) {
    console.error(`Unknown surface "${surface}". Known: ${Object.keys(SURFACES).join(", ")}`);
    process.exit(1);
  }
}

// ── small helpers ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd, cmdArgs, { cwd = APP_DIR, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd, shell: process.platform === "win32", windowsHide: true });
    let out = "";
    let err = "";
    if (capture) {
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
    }
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited ${code}\n${err.slice(-4000)}`))
    );
  });
}

async function clipDuration(file) {
  const out = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    file,
  ], { capture: true });
  const seconds = Number(out);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Unreadable duration for ${file}`);
  return seconds;
}

/**
 * Finds playwright wherever it happens to be installed: this app, a global install, or a scratch
 * directory named by PLAYWRIGHT_DIR. ESM `import` ignores NODE_PATH, so resolution has to be explicit
 * rather than left to the loader.
 */
async function loadPlaywright() {
  const candidates = [import.meta.url, path.join(APP_DIR, "package.json")];
  if (process.env.PLAYWRIGHT_DIR) candidates.push(path.join(process.env.PLAYWRIGHT_DIR, "package.json"));
  try {
    candidates.push(path.join(await run("npm", ["root", "-g"], { capture: true }), "..", "package.json"));
  } catch {}

  for (const from of candidates) {
    try {
      return createRequire(from)("playwright");
    } catch {}
  }
  console.error(
    "Cannot resolve `playwright`. Either:\n" +
      "  npm i -g playwright && npx playwright install chromium\n" +
      "or install it in a scratch directory and pass PLAYWRIGHT_DIR=<that directory>."
  );
  process.exit(1);
}

// ── the dev server ───────────────────────────────────────────────────────────

async function startDevServer() {
  const child = spawn("npx", ["next", "dev", "--port", String(opts.port)], {
    cwd: APP_DIR,
    shell: process.platform === "win32",
    windowsHide: true,
    env: { ...process.env, NEXT_PUBLIC_TOUR_EXPORT: "1", BROWSER: "none" },
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  const url = `http://localhost:${opts.port}/tour-export/intro`;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early:\n${log.slice(-4000)}`);
    try {
      const res = await fetch(url);
      // A 404 means the route compiled but the gate is off — worth saying plainly rather than
      // letting the recorder film an empty page for nine minutes.
      if (res.status === 404) throw new Error("Stage route 404s — NEXT_PUBLIC_TOUR_EXPORT did not reach the dev server.");
      if (res.ok) return child;
    } catch (err) {
      if (err.message.startsWith("Stage route")) throw err;
    }
    await sleep(1500);
  }
  throw new Error(`Dev server never became ready:\n${log.slice(-4000)}`);
}

// ── recording one surface ────────────────────────────────────────────────────

/**
 * A signed-in user who owes exactly the intro: `introSeen` false, everything after it true, so
 * ShellOnboarding opens the intro and its chain stops there rather than running on into the diagram
 * walkthrough (which is recorded separately, in full, from its own component).
 */
const MOCK_USER = {
  id: 1,
  email: "tour@example.com",
  name: "Tour",
  isAdmin: false,
  hasApiKey: true,
  hasTavilyKey: true,
  hasVoiceKey: true,
  introSeen: false,
  walkthroughSeen: true,
  coachWalkthroughSeen: true,
  practicalWalkthroughSeen: true,
  theoryWalkthroughSeen: true,
  tourSeen: true,
  examDate: null,
  lastDrillConfig: null,
};

async function record(chromium, surface, framesDir) {
  const { slides } = SURFACES[surface];
  const durations = [];
  for (let i = 0; i < slides; i++) {
    durations.push(await clipDuration(path.join(NARRATION_DIR, `${surface}-${i}.mp3`)));
  }

  const browser = await chromium.launch({
    args: [
      // The narration autoplays on slide entry in the real app; allowing it here keeps the speaker
      // icon in its true "speaking" state on camera. The output device is muted — the MP3s are muxed
      // in from disk, never captured.
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      "--hide-scrollbars",
    ],
  });
  // 1920x1080 at 1x: captured pixel-for-pixel, so no scaling ever touches the text.
  //
  // THE VIEWPORT HEIGHT IS A CORRECTNESS CONSTRAINT, not a preference. The walkthrough body is a
  // scroll container, so a short viewport does not reflow these slides — it hides the bottom of them,
  // silently, and nobody watching a video can scroll. Measured across all 36 slides: at 720 and 900
  // the densest Coach and Practical steps lose 100-220px below the fold; at 1080 nothing is cut
  // except the demo chat transcript, which is a scrolling panel that auto-scrolls itself and is
  // meant to be read that way. Do not shrink this without re-running that check.
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  await context.addInitScript(
    ([theme]) => {
      try {
        localStorage.setItem("mw-theme", theme);
        localStorage.setItem("mw-tour-narration-muted", "0");
      } catch {}
    },
    [opts.theme]
  );
  await context.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: MOCK_USER }) })
  );
  // Preference writes from the intro ("don't show this again", stage completion) must not reach a real
  // database from a recording run.
  await context.route("**/api/user/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );

  const page = await context.newPage();
  // Not `networkidle`: the dev server holds an HMR websocket open, so idle never arrives. The counter
  // below is the real readiness signal, and the generous timeout covers first-hit route compilation.
  await page.goto(`http://localhost:${opts.port}/tour-export/${surface}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  // The counter is the one element every surface's header has, and it only exists once the overlay
  // itself is mounted.
  await page.getByText(`1 / ${slides}`).first().waitFor({ timeout: 120_000 });
  // The dev-server badge sits in the bottom-left corner of every dev page and would be in every
  // frame. It is a shadow host, so hiding the host element is the whole job.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  // "Skip" is a control for someone sitting in the app; on camera it is an invitation nobody can
  // accept. The header is not remounted between slides, so hiding it once holds.
  await page.evaluate(() => {
    for (const button of document.querySelectorAll("button")) {
      if (button.textContent?.trim() === "Skip") button.style.visibility = "hidden";
    }
  });
  await page.waitForTimeout(600);

  const client = await context.newCDPSession(page);
  const frames = [];
  const writes = [];
  let index = 0;
  client.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = `f${String(index++).padStart(6, "0")}.jpg`;
    frames.push({ t: metadata.timestamp, file });
    writes.push(fs.writeFile(path.join(framesDir, file), Buffer.from(data, "base64")));
    client.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const firstFrame = new Promise((resolve) => client.once("Page.screencastFrame", resolve));
  await client.send("Page.startScreencast", {
    // JPEG at quality 95: a 1920x1080 PNG frame is ~2MB and the animated slides emit thousands of
    // them, which is minutes of disk write for a difference nobody can see after YouTube re-encodes.
    format: "jpeg",
    quality: 95,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });
  await firstFrame;

  // Frame timestamps are documented as wall-clock seconds, and everything below mixes them with
  // Date.now(). Rather than trust that across Chromium versions, measure the offset at a moment we
  // know a frame has just arrived and correct for it after the capture. Getting this wrong would
  // silently mis-time the whole soundtrack.
  const skew = Date.now() / 1000 - frames[0].t;

  // The timeline. `slideStart[i]` is when slide i actually appeared; the audio is padded to fit these
  // measurements afterwards, which is what keeps voice and picture together.
  const slideStart = [];
  await sleep(opts.lead * 1000);
  for (let i = 0; i < slides; i++) {
    slideStart.push(Date.now() / 1000);
    await sleep((durations[i] + opts.pad) * 1000);
    if (i < slides - 1) {
      await page.getByRole("button", { name: /^Next/ }).click();
      // Let the entering slide paint before the clock for it starts.
      await page.waitForTimeout(120);
    }
  }
  await sleep(opts.tail * 1000);
  const tEnd = Date.now() / 1000;

  await client.send("Page.stopScreencast");
  await Promise.all(writes);
  await context.close();
  await browser.close();

  if (Math.abs(skew) > 5) frames.forEach((frame) => (frame.t += skew));
  return { durations, frames, t0: frames[0].t, slideStart, tEnd };
}

// ── assembling ───────────────────────────────────────────────────────────────

async function buildAudio(surface, { durations, slideStart, t0, tEnd }, workDir) {
  // Each clip is padded to its slide's measured on-screen time. `whole_dur` sets the total length of
  // the padded stream, and the atrim guards the (shouldn't-happen) case of a clip longer than its
  // slide, which would otherwise push everything after it late.
  const holds = slideStart.map((start, i) =>
    Math.max(durations[i] + 0.05, (i + 1 < slideStart.length ? slideStart[i + 1] : tEnd) - start)
  );
  const lead = slideStart[0] - t0;

  const inputs = ["-f", "lavfi", "-t", lead.toFixed(3), "-i", "anullsrc=r=44100:cl=stereo"];
  const chains = ["[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0]"];
  holds.forEach((hold, i) => {
    inputs.push("-i", path.join(NARRATION_DIR, `${surface}-${i}.mp3`));
    chains.push(
      `[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
        `apad=whole_dur=${hold.toFixed(3)},atrim=0:${hold.toFixed(3)}[a${i + 1}]`
    );
  });
  const labels = holds.map((_, i) => `[a${i + 1}]`).join("");

  const audioPath = path.join(workDir, "audio.m4a");
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    ...inputs,
    "-filter_complex", `${chains.join(";")};[a0]${labels}concat=n=${holds.length + 1}:v=0:a=1[out]`,
    "-map", "[out]",
    "-c:a", "aac", "-b:a", "192k",
    audioPath,
  ]);
  return audioPath;
}

async function assemble(surface, timeline, workDir, framesDir) {
  const { tEnd } = timeline;
  // Frames can still arrive after the stop mark — the compositor has a backlog, and the heavily
  // animated Coach steps produce a big one. Keeping them makes the video outlast the soundtrack (1.7s
  // on the first Coach recording), because the audio is built to end at tEnd by construction. Dropping
  // them restores the invariant that the two tracks are the same length.
  const frames = timeline.frames.filter((frame) => frame.t <= tEnd);
  if (frames.length < 2) throw new Error(`Only ${frames.length} usable frames for ${surface}`);

  const lines = [];
  frames.forEach((frame, i) => {
    const until = i + 1 < frames.length ? frames[i + 1].t : tEnd;
    const duration = Math.max(1 / 240, until - frame.t);
    lines.push(`file '${frame.file}'`, `duration ${duration.toFixed(4)}`);
  });
  // The concat demuxer drops the final entry's duration unless the file is repeated.
  lines.push(`file '${frames[frames.length - 1].file}'`);
  await fs.writeFile(path.join(framesDir, "frames.txt"), lines.join("\n"));

  const audioPath = await buildAudio(surface, timeline, workDir);
  const outPath = path.join(OUT_DIR, `${surface}.mp4`);
  await run(
    "ffmpeg",
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", "frames.txt",
      "-i", audioPath,
      "-map", "0:v", "-map", "1:a",
      "-c:v", "libx264", "-preset", "slow", "-crf", "19",
      "-pix_fmt", "yuv420p", "-r", String(opts.fps), "-fps_mode", "cfr",
      "-vf", "scale=1920:1080:flags=lanczos",
      "-c:a", "copy",
      "-movflags", "+faststart",
      outPath,
    ],
    { cwd: framesDir }
  );
  return outPath;
}

// ── main ─────────────────────────────────────────────────────────────────────

const { chromium } = await loadPlaywright();
await fs.mkdir(OUT_DIR, { recursive: true });
const workRoot = path.join(APP_DIR, ".tour-video-work");
await fs.rm(workRoot, { recursive: true, force: true });

console.log(`Starting dev server on :${opts.port} …`);
const server = await startDevServer();
const results = [];

try {
  for (const surface of opts.surfaces) {
    const workDir = path.join(workRoot, surface);
    const framesDir = path.join(workDir, "frames");
    await fs.mkdir(framesDir, { recursive: true });

    console.log(`\n▸ ${surface} — ${SURFACES[surface].slides} slides, "${SURFACES[surface].title}"`);
    const timeline = await record(chromium, surface, framesDir);
    const spoken = timeline.durations.reduce((a, b) => a + b, 0);
    console.log(
      `  captured ${timeline.frames.length} frames over ${(timeline.tEnd - timeline.t0).toFixed(1)}s ` +
        `(${spoken.toFixed(1)}s of speech) — encoding …`
    );
    const outPath = await assemble(surface, timeline, workDir, framesDir);
    const { size } = await fs.stat(outPath);
    console.log(`  ✓ ${path.relative(REPO_ROOT, outPath)} — ${(size / 1e6).toFixed(1)} MB`);
    results.push({ surface, outPath, seconds: timeline.tEnd - timeline.t0 });
  }
} finally {
  server.kill();
  if (!opts.keepFrames) await fs.rm(workRoot, { recursive: true, force: true });
}

console.log("\nDone:");
for (const { surface, seconds, outPath } of results) {
  const minutes = Math.floor(seconds / 60);
  console.log(
    `  ${surface.padEnd(10)} ${minutes}m${String(Math.round(seconds % 60)).padStart(2, "0")}s  ${path.relative(REPO_ROOT, outPath)}`
  );
}
