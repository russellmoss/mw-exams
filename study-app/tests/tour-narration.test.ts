import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NARRATION_COUNTS,
  NARRATION_IDS,
  TOUR_NARRATION,
  narrationId,
  narrationParagraphs,
  narrationSrc,
  narrationTitle,
} from "@/lib/tour-narration";

// The tour voice-over is PRE-GENERATED and committed (see src/lib/tour-narration.ts for why), which
// means the audio and the text can silently disagree. Everything here exists to make that
// impossible: the manifest pins the hash of the text every clip was made from, and this suite fails
// the build gate if a string was edited without `npm run narration:build`.
//
// It also pins the two content decisions the feature was asked for, because both are the kind of
// thing a later copy edit quietly undoes:
//   • the intro narration carries the whole of each scene's "Learn more" dialog, and
//   • the walkthrough narration does NOT recite the slide.

const APP_ROOT = process.cwd();
const read = (path: string) => readFileSync(join(APP_ROOT, path), "utf8");
const NARRATION_DIR = join(APP_ROOT, "public", "narration");

interface Manifest {
  outputFormat: string;
  clips: Record<string, { textHash: string; chars: number; bytes: number; voiceId: string; modelId: string }>;
}

const manifest = JSON.parse(readFileSync(join(NARRATION_DIR, "manifest.json"), "utf8")) as Manifest;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("narration script covers every slide", () => {
  it("has one clip per slide of each surface, and nothing else", () => {
    const expected = (Object.keys(NARRATION_COUNTS) as (keyof typeof NARRATION_COUNTS)[]).flatMap(
      (surface) => Array.from({ length: NARRATION_COUNTS[surface] }, (_, i) => narrationId(surface, i))
    );
    expect(NARRATION_IDS).toEqual(expected);
  });

  it("matches each component's own slide count", () => {
    // ShellOnboarding hardcodes 6 scenes as `scene === 5` / `length: 6`; the walkthroughs use TOTAL.
    const totalOf = (file: string) => Number(read(file).match(/const TOTAL = (\d+)/)?.[1]);
    expect(totalOf("src/app/components/DiagramWalkthrough.tsx")).toBe(NARRATION_COUNTS.diagrams);
    expect(totalOf("src/app/components/CoachWalkthrough.tsx")).toBe(NARRATION_COUNTS.coach);
    expect(totalOf("src/app/components/PracticalWalkthrough.tsx")).toBe(NARRATION_COUNTS.practical);
    expect(read("src/app/components/ShellOnboarding.tsx")).toContain("{scene + 1} / 6");
  });

  it("says something substantial on every slide", () => {
    for (const id of NARRATION_IDS) {
      const text = TOUR_NARRATION[id];
      expect(text.length, `${id} is too short to be a voice-over`).toBeGreaterThan(200);
      // Markdown read aloud is "asterisk asterisk". The script is authored for the ear.
      expect(text, `${id} contains markdown`).not.toMatch(/\*\*|^\s*[-*]\s|\[.+\]\(.+\)/m);
    }
  });
});

describe("audio matches the script (the drift gate)", () => {
  it("has a generated clip for every id", () => {
    for (const id of NARRATION_IDS) {
      expect(manifest.clips[id], `${id} missing from manifest.json — run npm run narration:build`).toBeDefined();
      const file = join(NARRATION_DIR, `${id}.mp3`);
      expect(existsSync(file), `${id}.mp3 missing — run npm run narration:build`).toBe(true);
      // A truncated or error-page "mp3" would still exist. Every real clip here is tens of KB.
      expect(statSync(file).size, `${id}.mp3 is implausibly small`).toBeGreaterThan(20_000);
    }
  });

  it("was generated from the text that is in the script today", () => {
    for (const id of NARRATION_IDS) {
      expect(
        manifest.clips[id].textHash,
        `${id}: the narration text changed but the audio was not rebuilt — run npm run narration:build`
      ).toBe(sha256(TOUR_NARRATION[id]));
    }
  });

  it("is all one voice and one model", () => {
    // George, and the multilingual model — the wine vocabulary is why (lib/voices.ts).
    const voices = new Set(Object.values(manifest.clips).map((c) => c.voiceId));
    const models = new Set(Object.values(manifest.clips).map((c) => c.modelId));
    expect([...voices]).toEqual(["JBFqnCBsd6RMkjVDRZzb"]);
    expect([...models]).toEqual(["eleven_multilingual_v2"]);
  });

  it("carries no clip the script no longer holds", () => {
    expect(Object.keys(manifest.clips).sort()).toEqual([...NARRATION_IDS].sort());
  });
});

describe("intro narration carries the Learn more content", () => {
  // The whole point of the intro voice-over: the substance behind each headline lives in a dialog
  // most people never open, so the narration says it aloud. These are the load-bearing facts from
  // each scene's INFO_PARAS entry — if a fact leaves the narration, the listener stops getting the
  // depth the reader gets.
  const REQUIRED: Record<number, string[]> = {
    0: ["Chardonnay", "Riesling", "sparkling", "one-in-four", "anchors"],
    1: ["10,000", "300", "Mark allocations", "structural families", "Stem Analysis"],
    2: ["2011", "45 papers", "540", "Decanter", "13 official examiner reports", "shoehorning"],
    3: ["89 percent", "64 percent", "396", "Top-one accuracy", "one in three"],
    4: ["243", "viticulture", "contemporary issues", "differentiators", "model answer"],
  };

  for (const [scene, needles] of Object.entries(REQUIRED)) {
    it(`scene ${Number(scene) + 1} speaks its dialog`, () => {
      const text = TOUR_NARRATION[narrationId("intro", Number(scene))];
      for (const needle of needles) {
        expect(text, `intro scene ${Number(scene) + 1} narration dropped "${needle}"`).toContain(needle);
      }
    });
  }

  it("does not contradict the slide it sits on", () => {
    // The one number on the scene-4 slide, spoken back the way a narrator says it.
    expect(TOUR_NARRATION["intro-3"]).toContain("89 percent");
    expect(read("src/app/components/ShellOnboarding.tsx")).toContain('value="89%"');
  });
});

describe("walkthrough narration explains rather than recites", () => {
  // The owner's instruction was explicit: on the diagram and Coach slides the voice must not read
  // the screen. A cheap, honest proxy — the slide's own headline must not appear verbatim in the
  // narration of that slide.
  const HEADLINES: [string, string][] = [
    ["diagrams-0", "Start with a real question."],
    ["diagrams-1", "The diagrams live in the Library."],
    ["diagrams-2", "Route the stem to a family."],
    ["diagrams-3", "Read the leaf. Three tiers."],
    ["diagrams-4", "Now you taste."],
    ["diagrams-5", "What was actually in the glasses."],
    ["coach-1", "Ask it anything technical."],
    ["coach-2", "Not the web. A library."],
    ["coach-3", "Ask it how to get better."],
    ["practical-2", "The modes are not"],
    ["practical-4", "Then treat it like"],
    ["practical-7", "On the day."],
  ];

  for (const [id, headline] of HEADLINES) {
    it(`${id} does not read its headline back`, () => {
      expect(TOUR_NARRATION[id].toLowerCase()).not.toContain(headline.toLowerCase());
    });
  }

  it("commentates the Coach demos instead of describing the UI", () => {
    // Each demo slide plays a scripted conversation; the narration's job is to say what to notice
    // while it runs.
    for (const id of ["coach-1", "coach-3", "coach-4", "coach-5"]) {
      expect(TOUR_NARRATION[id], `${id} should point the listener at the demo`).toMatch(/watch|notice|look at/i);
    }
  });
});

describe("the speaker control is wired into all three surfaces", () => {
  const component = read("src/app/components/TourNarration.tsx");

  it("renders nothing when the clip could not be loaded", () => {
    // The requested behaviour: no key, no file, no audio support → no icon, not a broken one.
    expect(component).toContain("if (!available) return null;");
    expect(component).toContain('audio.addEventListener("error"');
  });

  it("remembers the mute choice across slides and sessions", () => {
    expect(component).toContain("mw-tour-narration-muted");
    expect(component).toContain("localStorage");
  });

  it("recovers from a blocked autoplay instead of giving up", () => {
    expect(component).toContain("NotAllowedError");
    expect(component).toContain('document.addEventListener("pointerdown"');
  });

  it("appears in the intro and all three walkthroughs", () => {
    for (const [file, surface] of [
      ["src/app/components/ShellOnboarding.tsx", "intro"],
      ["src/app/components/DiagramWalkthrough.tsx", "diagrams"],
      ["src/app/components/CoachWalkthrough.tsx", "coach"],
      ["src/app/components/PracticalWalkthrough.tsx", "practical"],
    ] as const) {
      const source = read(file);
      expect(source).toContain("TourNarrationButton");
      expect(source).toContain(`narrationId("${surface}"`);
    }
  });

  it("serves clips as static assets, not through an API route", () => {
    expect(narrationSrc("intro-0")).toBe("/narration/intro-0.mp3");
  });
});

describe("every slide has a readable Learn more card", () => {
  // The narration transcript IS the card body, so muting (or being unable to play audio at all)
  // costs the reader nothing. Before this the depth behind the fifteen walkthrough slides was
  // audio-only.
  it("has a title for every clip, distinct from the slide headline", () => {
    for (const id of NARRATION_IDS) {
      const title = narrationTitle(id);
      expect(title, `${id} has no Learn more title`).not.toBe("Learn more");
      expect(title.length).toBeGreaterThan(6);
    }
  });

  it("splits every transcript into renderable paragraphs", () => {
    for (const id of NARRATION_IDS) {
      const paragraphs = narrationParagraphs(id);
      expect(paragraphs.length, `${id} renders as no paragraphs`).toBeGreaterThan(0);
      // A single wall of 900 characters is not a card anyone reads.
      expect(paragraphs.every((p) => p.length > 0)).toBe(true);
      expect(paragraphs.join("\n\n")).toBe(TOUR_NARRATION[id]);
    }
  });

  it("is reachable from every slide of all four surfaces", () => {
    for (const file of [
      "src/app/components/ShellOnboarding.tsx",
      "src/app/components/DiagramWalkthrough.tsx",
      "src/app/components/CoachWalkthrough.tsx",
      "src/app/components/PracticalWalkthrough.tsx",
    ]) {
      const source = read(file);
      expect(source, `${file} has no Learn more control`).toContain("TourLearnMoreButton");
      // Not gated on the step index — the closing slide of each surface gets one too.
      expect(source).not.toMatch(/scene < 5 &&\s*<TourLearnMoreButton/);
      expect(source).not.toMatch(/step < TOTAL - 1 &&\s*<TourLearnMoreButton/);
    }
  });

  it("keeps one body of depth per slide, not two that can drift", () => {
    // The intro's hand-written INFO_PARAS/INFO_TITLES were retired into the transcript. A second
    // copy would drift silently: nobody proof-reads a card against an MP3.
    const shell = read("src/app/components/ShellOnboarding.tsx");
    expect(shell).not.toMatch(/const INFO_PARAS/);
    expect(shell).not.toMatch(/const INFO_TITLES/);
  });

  it("does not let the arrow keys page the slide underneath an open card", () => {
    // Both walkthroughs bind ArrowLeft/ArrowRight on window; a capture-phase listener is the only
    // thing that can stop them firing while someone is reading.
    const card = read("src/app/components/TourLearnMore.tsx");
    expect(card).toContain('window.addEventListener("keydown", onKey, true)');
    expect(card).toContain("ArrowLeft");
    expect(card).toContain("Escape");
  });
});
