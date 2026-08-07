// tasting-note-schema.test.ts — validateTastingNoteSchema() mandatory-field gate.
//
// Recurring user-feedback cluster (cross-paper, 4 validated signals: fb_246, fb_244, fb_66, fb_53):
// served tasting notes are structurally incomplete in the same ways — no alcohol level (fb_246), no
// visual cue on Paper 3 (fb_53), and negative "no bubbles" phrasing asserting the absence of bubbles
// (fb_244). The schema enforces the mandatory fields — appearance colour, alcohol, acidity — frames
// bubbles positively, and (Paper 3) requires a non-generic appearance clause. Descriptor accuracy
// (fb_66's Syrah markers) is deliberately left to the rolling digest.
import { describe, it, expect } from "vitest";
import { validateTastingNoteSchema } from "../src/lib/question-validator";

// A complete still-red note carrying colour + alcohol + acidity, with no bubble phrasing.
const COMPLETE_RED =
  "**Appearance:** medium garnet, clear.\n" +
  "**Nose:** cherry, tar, dried rose.\n" +
  "**Palate:** dry, high acidity, firm tannin, medium alcohol (~13.5%), long finish.";

describe("validateTastingNoteSchema — mandatory fields", () => {
  it("passes a complete note (colour + alcohol + acidity)", () => {
    const r = validateTastingNoteSchema(COMPLETE_RED, { paper: 2 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("fails with NOTE_MISSING_ALCOHOL when no alcohol reference is present", () => {
    const note =
      "**Appearance:** medium garnet, clear.\n" +
      "**Palate:** dry, high acidity, firm tannin, long finish.";
    const r = validateTastingNoteSchema(note, { paper: 2 });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain("NOTE_MISSING_ALCOHOL");
  });

  it("accepts a low/medium/high alcohol band in place of a % figure", () => {
    const note =
      "**Appearance:** pale lemon, bright.\n" +
      "**Palate:** dry, high acidity, low alcohol, short finish.";
    const r = validateTastingNoteSchema(note, { paper: 1 });
    expect(r.ok).toBe(true);
  });

  it("fails with NOTE_MISSING_ACIDITY when no acidity statement is present", () => {
    const note =
      "**Appearance:** deep ruby, clear.\n" +
      "**Palate:** dry, soft tannin, medium alcohol (~13%), long finish.";
    const r = validateTastingNoteSchema(note, { paper: 2 });
    expect(r.violations.map((v) => v.code)).toContain("NOTE_MISSING_ACIDITY");
  });

  it("fails with NOTE_MISSING_APPEARANCE when the appearance names no colour", () => {
    const note =
      "**Appearance:** bright and clear.\n" +
      "**Palate:** dry, high acidity, medium alcohol (~13%).";
    const r = validateTastingNoteSchema(note, { paper: 2 });
    expect(r.violations.map((v) => v.code)).toContain("NOTE_MISSING_APPEARANCE");
  });
});

describe("validateTastingNoteSchema — bubbles framed positively", () => {
  it("fails with NOTE_NEGATIVE_BUBBLES for a still-wine note saying 'no bubbles are present'", () => {
    const note =
      "**Appearance:** deep ruby, clear; no bubbles are present.\n" +
      "**Palate:** dry, high acidity, firm tannin, medium alcohol (~14%).";
    const r = validateTastingNoteSchema(note, { paper: 2 });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain("NOTE_NEGATIVE_BUBBLES");
  });

  it("also catches 'absence of bubbles' / 'no mousse' / 'still with no bead'", () => {
    for (const phrase of ["absence of bubbles", "no mousse", "still, with no bead"]) {
      const note =
        `**Appearance:** medium gold, clear; ${phrase}.\n` +
        "**Palate:** dry, medium acidity, medium alcohol (~13%).";
      const r = validateTastingNoteSchema(note, { paper: 2 });
      expect(r.violations.map((v) => v.code)).toContain("NOTE_NEGATIVE_BUBBLES");
    }
  });

  it("requires a mousse intensity for a sparkling wine (NOTE_MISSING_MOUSSE)", () => {
    const bare =
      "**Appearance:** pale lemon, bright, with a mousse.\n" +
      "**Palate:** dry, high acidity, medium alcohol (~12.5%).";
    const r = validateTastingNoteSchema(bare, { paper: 3, sparkling: true });
    expect(r.violations.map((v) => v.code)).toContain("NOTE_MISSING_MOUSSE");

    const withIntensity =
      "**Appearance:** pale lemon-green, bright, with a fine, persistent mousse.\n" +
      "**Palate:** dry, high acidity, medium alcohol (~12.5%).";
    const ok = validateTastingNoteSchema(withIntensity, { paper: 3, sparkling: true });
    expect(ok.ok).toBe(true);
  });
});

describe("validateTastingNoteSchema — Paper 3 non-generic appearance", () => {
  it("passes 'pale lemon-green, bright' plus alcohol and acid", () => {
    const note =
      "**Appearance:** pale lemon-green, bright.\n" +
      "**Palate:** dry, high acidity, medium alcohol (~12.5%), long finish.";
    const r = validateTastingNoteSchema(note, { paper: 3 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("fails with NOTE_GENERIC_APPEARANCE for a bare colour on Paper 3", () => {
    const note =
      "**Appearance:** lemon.\n" +
      "**Palate:** dry, high acidity, medium alcohol (~12.5%).";
    const r = validateTastingNoteSchema(note, { paper: 3 });
    expect(r.violations.map((v) => v.code)).toContain("NOTE_GENERIC_APPEARANCE");
  });

  it("does not apply the non-generic rule on Papers 1/2", () => {
    const note =
      "**Appearance:** lemon.\n" +
      "**Palate:** dry, high acidity, medium alcohol (~12.5%).";
    const r = validateTastingNoteSchema(note, { paper: 1 });
    expect(r.violations.map((v) => v.code)).not.toContain("NOTE_GENERIC_APPEARANCE");
  });
});
