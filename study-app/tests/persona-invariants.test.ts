import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PERSONA,
  PERSONAS,
  isPersonaId,
  personaBlock,
  resolvePersonaFor,
  type PersonaSurface,
} from "@/lib/personas";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURFACES: PersonaSurface[] = ["grading", "chat", "oneliner", "verdict", "spoken"];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The persona feature's whole safety argument is that a TONE dial is not secretly a DIFFICULTY
// dial. A grading model told to "be blunt and brief" does not confine itself to word choice — it
// notices less and cites less — so every persona block ships an invariant preamble that fixes the
// assessment before the voice is consulted.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. It is a structural gate: it proves the instruction is
// present in every voice on every surface, which is what stops a future edit from quietly dropping
// it. It CANNOT prove the model obeys it — that needs the same answer graded four ways against a
// live model, which is an eval, not a unit test. See the note at the bottom of this file.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("persona invariants — a voice may change wording, never assessment", () => {
  it("states that marks and verdicts are fixed, in every voice on every surface", () => {
    for (const p of PERSONAS) {
      for (const surface of SURFACES) {
        const block = personaBlock(p.id, surface);
        expect(block, `${p.id}/${surface}`).toMatch(/assessment is already fixed/i);
        expect(block, `${p.id}/${surface}`).toMatch(/Grade exactly as you would in any other voice/i);
      }
    }
  });

  it("forbids dropping a finding to fit a tone, in every voice on every surface", () => {
    // The specific failure: The Examiner reads "be terse" and omits the mark-costing error rather
    // than the throat-clearing. That is a worse tool, not a tighter one.
    for (const p of PERSONAS) {
      for (const surface of SURFACES) {
        const block = personaBlock(p.id, surface);
        expect(block, `${p.id}/${surface}`).toMatch(/Every finding survives/i);
        expect(block, `${p.id}/${surface}`).toMatch(/Brevity means less padding, not less content/i);
      }
    }
  });

  it("keeps the output structure out of the voice's reach", () => {
    // Several of these prompts are parsed by the UI (headings) or by the fix pipeline (the
    // recommendation token). A persona that reformats them breaks a screen, not just a mood.
    for (const p of PERSONAS) {
      for (const surface of SURFACES) {
        expect(personaBlock(p.id, surface), `${p.id}/${surface}`).toMatch(
          /output structure is fixed/i
        );
      }
    }
  });

  it("ranks accuracy above the voice, so no persona may invent material", () => {
    for (const p of PERSONAS) {
      for (const surface of SURFACES) {
        const block = personaBlock(p.id, surface);
        expect(block, `${p.id}/${surface}`).toMatch(/Accuracy outranks the voice/i);
        expect(block, `${p.id}/${surface}`).toMatch(/[Nn]ever invent a flaw/);
      }
    }
  });

  it("routes the DEFAULT persona through the same channel as the others", () => {
    // Not a special case that skips the invariants: one code path, or the guarantees above are
    // only true of the voices someone remembered to check.
    const block = personaBlock(DEFAULT_PERSONA, "grading");
    expect(block).toMatch(/assessment is already fixed/i);
    // An unknown/null value must resolve to the default rather than emitting an empty block.
    expect(personaBlock(null, "grading")).toBe(block);
    expect(personaBlock(undefined, "grading")).toBe(block);
    expect(personaBlock("nonsense" as never, "grading")).toBe(block);
  });
});

describe("the roast persona's floor", () => {
  // "chat" rather than "grading": graded surfaces are gated to the Tutor right now, so asking for
  // the roast block there would return the Tutor's and these assertions would test nothing.
  const roast = personaBlock("roast", "chat");

  it("targets the answer and rules out the person", () => {
    expect(roast).toMatch(/Mock the decision, never the human/i);
    // The protected-characteristic carve-out is the load-bearing line. Named explicitly so a
    // reword cannot thin it out to a vague "be respectful".
    expect(roast).toMatch(/appearance, age, sex, race, nationality, accent, class, disability, religion/i);
    expect(roast).toMatch(/[Nn]o slurs/);
  });

  it("bans the discouragement failure mode specifically", () => {
    // Mockery that removes hope is the one that does real damage to someone two years into an MW.
    expect(roast).toMatch(/Never tell them to quit/i);
    expect(roast).toMatch(/not a prognosis|issuing a prognosis/i);
  });

  it("still requires genuine praise, so the bit cannot eat the teaching", () => {
    expect(roast).toMatch(/[Gg]rudging praise is still praise/);
    expect(roast).toMatch(/If the answer is good, say so/i);
  });

  it("demands specificity, which is what separates a roast from abuse", () => {
    expect(roast).toMatch(/Specificity is the joke/i);
  });
});

describe("surface riders", () => {
  it("floors the mockery on bad news, in every voice", () => {
    // A candidate mocked for filing a report stops filing reports, and that feedback loop is the
    // only thing improving the question bank. The floor is emitted for all four voices, not just
    // the funny ones, so the rule reads the same however it is later edited.
    for (const p of PERSONAS) {
      expect(personaBlock(p.id, "verdict"), p.id).toMatch(/BAD-NEWS FLOOR/);
    }
    expect(personaBlock("roast", "verdict")).toMatch(/drop the mockery and the jokes entirely/i);
  });

  it("bans markdown on the spoken surface, in every voice", () => {
    // It is fed straight to TTS; a bullet character is read aloud or silently mangled.
    for (const p of PERSONAS) {
      const block = personaBlock(p.id, "spoken");
      expect(block, p.id).toMatch(/read ALOUD/);
      expect(block, p.id).toMatch(/no markdown/i);
    }
  });

  it("lets the one-liner surface drop the voice rather than the substance", () => {
    // Gated surface, so bypass to assert the rider that will apply once the flag flips.
    expect(personaBlock("roast", "oneliner", { bypassSurfaceGate: true })).toMatch(/drop the voice/i);
  });
});

describe("scope — exam content is never persona-voiced", () => {
  // A model answer is an exemplar the candidate imitates under time pressure; a question stem is
  // meant to read like the IMW wrote it. Voicing either teaches a habit that fails in the exam.
  // Asserted at the import level because that is the only place it can be caught mechanically.
  const FORBIDDEN = [
    "src/lib/prompts/question-generation-prompt.ts",
    "src/lib/prompts/model-answer-prompt.ts",
    "src/lib/prompts/tasting-prompt.ts",
    "src/lib/prompts/stemDetail.ts",
    "src/lib/question-engine.ts",
    // The Live Tasting shopping brief: a list the candidate spends real money against, and
    // machine-validated for paper scope. A joke in it is a bottle bought wrong.
    "src/lib/live-tasting-engine.ts",
  ];

  it("keeps personaBlock out of every exam-content generator", () => {
    const offenders = FORBIDDEN.filter((rel) => {
      const full = path.join(appDir, rel);
      if (!fs.existsSync(full)) return false;
      return /personaBlock|getUserPersona/.test(fs.readFileSync(full, "utf8"));
    });
    expect(
      offenders,
      "exam content must read as the IMW wrote it, whatever voice the candidate chose"
    ).toEqual([]);
  });
});

describe("the graded-surface gate", () => {
  // Why the gate exists: persona-grading.eval.test.ts measured one script under all four voices
  // and got three different verdicts, then — after a calibration fix — a 19-point swing the other
  // way from the Cellar Rat. A voice whose register is evaluative leaks into the judgement, so
  // graded surfaces stay pinned to the reference voice until the assessment is separated from the
  // delivery structurally. These assertions stop the flag being flipped by accident.

  it("pins graded surfaces to the reference voice while the flag is off", () => {
    for (const p of PERSONAS) {
      expect(resolvePersonaFor(p.id, "grading"), p.id).toBe(DEFAULT_PERSONA);
      expect(resolvePersonaFor(p.id, "oneliner"), p.id).toBe(DEFAULT_PERSONA);
    }
    // …and the emitted prompt really is the Tutor's, not just the resolved id.
    expect(personaBlock("roast", "grading")).toBe(personaBlock("mentor", "grading"));
  });

  it("leaves conversational surfaces alone — they carry no mark to corrupt", () => {
    for (const surface of ["chat", "verdict", "spoken"] as PersonaSurface[]) {
      for (const p of PERSONAS) {
        expect(resolvePersonaFor(p.id, surface), `${p.id}/${surface}`).toBe(p.id);
      }
      expect(personaBlock("roast", surface)).not.toBe(personaBlock("mentor", surface));
    }
  });

  it("keeps the eval's bypass out of application code", () => {
    // bypassSurfaceGate exists so the eval can measure the suppressed voices. A route reaching for
    // it would silently re-enable exactly what the measurement says is not safe yet.
    const srcDir = path.join(appDir, "src");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.tsx?$/.test(e.name) ? [full] : [];
      });
    const offenders = walk(srcDir).filter(
      (f) =>
        // personas.ts declares the option; everything else must not pass it.
        path.basename(f) !== "personas.ts" &&
        /bypassSurfaceGate/.test(fs.readFileSync(f, "utf8"))
    );
    expect(offenders.map((f) => path.relative(appDir, f))).toEqual([]);
  });
});

describe("catalog and schema agree", () => {
  it("accepts exactly the four known ids", () => {
    expect(PERSONAS.map((p) => p.id).sort()).toEqual(["examiner", "mentor", "roast", "wit"]);
    expect(isPersonaId("mentor")).toBe(true);
    expect(isPersonaId("MENTOR")).toBe(false);
    expect(isPersonaId("")).toBe(false);
    expect(isPersonaId(null)).toBe(false);
    expect(isPersonaId(undefined)).toBe(false);
  });

  it("matches the CHECK constraint in the migration", () => {
    // Drift here is a 500 on save, or worse a row the app cannot render. The constraint and the
    // catalog have to be edited together, so assert it rather than trusting the pairing.
    const sql = fs.readFileSync(path.join(appDir, "migrations/068_persona.sql"), "utf8");
    for (const p of PERSONAS) expect(sql, p.id).toMatch(new RegExp(`'${p.id}'`));
    expect(sql).toMatch(new RegExp(`DEFAULT '${DEFAULT_PERSONA}'`));
  });

  it("gives every persona the copy the picker renders", () => {
    for (const p of PERSONAS) {
      expect(p.name.length, p.id).toBeGreaterThan(0);
      expect(p.tagline.length, p.id).toBeGreaterThan(0);
      // The sample is how a user actually chooses — four abstract tone descriptions are much
      // harder to pick between than four renderings of the same sentence.
      expect(p.sample.length, p.id).toBeGreaterThan(60);
      expect(p.description.length, p.id).toBeGreaterThan(60);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// STILL UNPROVEN, and worth stating plainly: that the model OBEYS the invariants above. The claim
// the UI makes to the candidate — "every voice gives you the same marks" — is currently a
// well-constructed prompt, not a measurement. Settling it means grading a fixed set of real
// answers under all four personas and comparing the awarded marks and the finding counts, which
// costs live model calls and belongs in a *.eval.test.ts run, not the build gate.
// ─────────────────────────────────────────────────────────────────────────────────────────────
