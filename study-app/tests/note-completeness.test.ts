// note-completeness.test.ts — the tasting-note completeness / bubble-integrity gate.
//
// Feedback cluster (fb_246, fb_244, fb_53): generated tasting notes omit the visual + structural
// markers a candidate leads with (colour + intensity; alcohol/warmth), and some describe the ABSENCE
// of bubbles. These pin that (1) a note with no alcohol reading is rejected, (2) a still-wine note
// that states "no mousse" is rejected, (3) a sparkling note with a graded mousse + colour + %abv
// passes, and (4) a Paper-3 four-wine flight where one note lacks a colour is rejected — checked via
// both the serve-time gate (validateTastingNotes) and the KEY-stage wrapper (checkNoteCompleteness).
import { describe, it, expect } from "vitest";
import { validateTastingNotes } from "@/lib/tasting-validators";
import { checkNoteCompleteness } from "@/lib/question-validator";

const RED = { slot: 1, fullText: "Wine 1 — Barolo 2018" };
const SPARKLING = { slot: 1, fullText: "Wine 1 — Champagne Brut NV" };

const codes = (notes: string[], wines: { slot: number; fullText: string }[], paper?: number) =>
  checkNoteCompleteness(notes, wines, paper).map((v) => v.rule);

describe("note completeness — alcohol", () => {
  it("rejects a note with no alcohol reference anywhere", () => {
    const note =
      "**Appearance:** medium lemon, bright.\n\n**Nose:** citrus, apple.\n\n**Palate:** dry, high acidity, crisp long finish.";
    expect(validateTastingNotes([note], [RED], 2).valid).toBe(false);
    expect(codes([note], [RED], 2)).toContain("note_missing_alcohol");
  });

  it("accepts a note carrying a low/medium/high alcohol descriptor", () => {
    const note =
      "**Appearance:** deep garnet, clear.\n\n**Structure:** high alcohol, full body; high acidity; firm tannin.\n\n**Nose:** cherry, tar.";
    expect(codes([note], [RED], 2)).not.toContain("note_missing_alcohol");
  });
});

describe("note completeness — negative bubbles (fb_244)", () => {
  it("rejects a still-wine note that states 'no mousse'", () => {
    const note =
      "**Appearance:** deep garnet, clear. Still, with no mousse.\n\n**Structure:** warm, full body, ~14%; high acidity; firm tannin.\n\n**Nose:** cherry.";
    expect(validateTastingNotes([note], [RED], 2).valid).toBe(false);
    expect(codes([note], [RED], 2)).toContain("note_negative_bubbles");
  });

  it("rejects mousse/bead language on a still wine", () => {
    const note =
      "**Appearance:** deep garnet, clear, with a gentle bead.\n\n**Structure:** warm, full body, ~14%; high acidity.\n\n**Nose:** cherry.";
    expect(codes([note], [RED], 2)).toContain("note_mousse_on_still");
  });
});

describe("note completeness — sparkling positive case", () => {
  it("passes a sparkling note with a graded mousse, colour and %abv", () => {
    const note =
      "**Appearance:** pale lemon-gold, fine persistent mousse.\n\n**Structure:** medium body, 12% abv; high acidity.\n\n**Nose:** brioche, green apple, citrus.";
    expect(validateTastingNotes([note], [SPARKLING]).valid).toBe(true);
    expect(checkNoteCompleteness([note], [SPARKLING])).toHaveLength(0);
  });
});

describe("note completeness — appearance colour (fb_53, Paper 3 flight)", () => {
  it("rejects a P3 four-wine flight where one note lacks a colour", () => {
    const wines = [
      { slot: 1, fullText: "Wine 1 — Chablis" },
      { slot: 2, fullText: "Wine 2 — Sancerre" },
      { slot: 3, fullText: "Wine 3 — Mosel Riesling" },
      { slot: 4, fullText: "Wine 4 — Alsace Pinot Gris" },
    ];
    const good = (slot: number) =>
      `**Appearance:** pale lemon, bright.\n\n**Structure:** medium body, ~12.5%; high acidity.\n\n**Nose:** citrus, orchard fruit (wine ${slot}).`;
    // Wine 4's appearance names an intensity but no colour.
    const bad =
      "**Appearance:** medium intensity, clear.\n\n**Structure:** medium body, ~12.5%; high acidity.\n\n**Nose:** citrus.";
    const notes = [good(1), good(2), good(3), bad];
    const result = checkNoteCompleteness(notes, wines, 3);
    expect(result.some((v) => v.rule === "note_missing_appearance")).toBe(true);
    expect(validateTastingNotes(notes, wines, 3).valid).toBe(false);
  });

  it("passes a P3 flight where every note carries colour + intensity + alcohol", () => {
    const wines = [
      { slot: 1, fullText: "Wine 1 — Chablis" },
      { slot: 2, fullText: "Wine 2 — Sancerre" },
    ];
    const good = (slot: number) =>
      `**Appearance:** pale lemon, bright.\n\n**Structure:** medium body, ~12.5%; high acidity.\n\n**Nose:** citrus (wine ${slot}).`;
    expect(checkNoteCompleteness([good(1), good(2)], wines, 3)).toHaveLength(0);
  });
});
