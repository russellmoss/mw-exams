import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PERSONA,
  getPersona,
  needsRestyle,
  personaBlock,
  resolvePersonaFor,
} from "@/lib/personas";
import { LEGACY_ELEVENLABS_VOICE_ID } from "@/lib/voices";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// bypassSurfaceGate, because Unhinged is pinned neutral on EVERY surface at generation time — the
// voice only exists inside the re-voicing pass, which is exactly what these assertions inspect.
const voice = personaBlock("unhinged", "chat", { bypassSurfaceGate: true });

describe("Unhinged — the vendor split", () => {
  it("is written by Grok and marked as such", () => {
    expect(getPersona("unhinged").copyProvider).toBe("grok");
  });

  it("never lets Anthropic see the voice, on any surface", () => {
    // Not squeamishness — a refusal or a watered-down half-version is a worse product than a clean
    // hand-off. Claude writes the substance neutrally; xAI writes the words.
    for (const surface of ["grading", "chat", "verdict", "spoken", "oneliner"] as const) {
      expect(resolvePersonaFor("unhinged", surface), surface).toBe(DEFAULT_PERSONA);
      expect(personaBlock("unhinged", surface), surface).toBe(personaBlock("mentor", surface));
    }
  });

  it("re-voices everywhere there is prose, so the voice is not decorative", () => {
    for (const surface of ["grading", "chat", "verdict", "spoken"] as const) {
      expect(needsRestyle("unhinged", surface), surface).toBe(true);
    }
    expect(needsRestyle("unhinged", "oneliner")).toBe(false);
  });

  it("degrades to the neutral text rather than failing when xAI is unavailable", () => {
    // The whole feature is cosmetic; a missing key or a bad afternoon at xAI must never cost a
    // candidate their debrief.
    const src = fs.readFileSync(path.join(appDir, "src/lib/persona-restyle.ts"), "utf8");
    expect(src).toMatch(/no_copy_key/);
    expect(src).toMatch(/return \{ text: neutralText, outcome: "no_copy_key" \}/);
    const grok = fs.readFileSync(path.join(appDir, "src/lib/grok.ts"), "utf8");
    // Every failure path in the client returns null rather than throwing.
    expect(grok).toMatch(/falling back to the neutral text/);
  });

  it("still runs the fingerprint gate on what Grok returns", () => {
    // The marks guarantee does not care which vendor wrote the prose.
    const src = fs.readFileSync(path.join(appDir, "src/lib/persona-restyle.ts"), "utf8");
    const grokBranch = src.slice(src.indexOf('copyProvider === "grok"'));
    expect(grokBranch).toMatch(/assessmentDrift\(/);
    expect(grokBranch).toMatch(/outcome: "assessment_drift"/);
  });
});

describe("Unhinged — the floors that hold at any volume", () => {
  it("bans slurs against who the candidate IS", () => {
    // The line is not "no profanity" — profanity is the entire point. It is that the target is a
    // wine answer, never a protected characteristic. This is also the only part with real legal
    // exposure attached, so it is asserted by name rather than by vibe.
    expect(voice).toMatch(/No slurs against who they ARE/i);
    expect(voice).toMatch(/race, ethnicity, nationality, religion, sexuality, gender identity or disability/i);
  });

  it("keeps invective from becoming sexual content", () => {
    expect(voice).toMatch(/No sexual content/i);
    expect(voice).toMatch(/never sexualise the candidate/i);
  });

  it("never tells the candidate to quit", () => {
    // A study tool that talks someone out of sitting the exam has failed at the only thing it is
    // for, however funny the line was.
    expect(voice).toMatch(/Never tell them to quit/i);
  });

  it("still requires the teaching to arrive", () => {
    expect(voice).toMatch(/THE INFORMATION STILL HAS TO ARRIVE/);
    expect(voice).toMatch(/all insult and no teaching has failed/i);
  });

  it("still credits a genuine strength", () => {
    expect(voice).toMatch(/Never withhold a real strength/i);
  });
});

describe("Unhinged — the delivery", () => {
  it("pins its own narration voice instead of offering a choice", () => {
    expect(getPersona("unhinged").lockedVoiceId).toBe(LEGACY_ELEVENLABS_VOICE_ID);
    // And the narration path must actually honour it over the user's Settings choice.
    const src = fs.readFileSync(path.join(appDir, "src/lib/feedback-analysis.ts"), "utf8");
    expect(src).toMatch(/lockedVoiceId \?\? \(opts\.userId/);
  });

  it("warns in its own words before it can be selected", () => {
    const p = getPersona("unhinged");
    expect(p.edgy).toBe(true);
    // The generic edgy warning materially undersells this one, so it carries bespoke copy and the
    // picker prefers it.
    expect(p.warning, "Unhinged must carry its own confirmation copy").toBeTruthy();
    expect(p.warning!).toMatch(/abusive/i);
    const picker = fs.readFileSync(
      path.join(appDir, "src/app/components/PersonaPicker.tsx"),
      "utf8"
    );
    expect(picker).toMatch(/p\.warning \?\?/);
  });

  it("is gated on a key at every place it can be chosen", () => {
    // Selecting it without an xAI key would silently serve the Tutor, which reads as the setting
    // being broken rather than unavailable.
    for (const rel of ["src/app/settings/page.tsx", "src/app/onboarding/page.tsx"]) {
      const src = fs.readFileSync(path.join(appDir, rel), "utf8");
      expect(src, rel).toMatch(/hasGrokKey/);
      expect(src, rel).toMatch(/unhinged:/);
    }
  });
});
