import { describe, it, expect } from "vitest";
import {
  assessmentDrift,
  fingerprintAssessment,
} from "@/lib/persona-restyle";
import { gradedRestyleEnabled, resolvePersonaFor, PERSONAS, DEFAULT_PERSONA } from "@/lib/personas";

// The fingerprint is the whole guarantee of the two-pass split. Pass 2 is TOLD not to move a mark
// and pass 2 is a language model, so what actually holds the promise is this comparison and the
// discard behind it. These are fast, pure tests of that comparison; the live behaviour is measured
// in persona-grading.eval.test.ts.

const NEUTRAL = `## In the Glass

### Overall Assessment

**Result: BORDERLINE**

**Estimated marks: 28-32 out of 50**

The identification was sound but the quality answer stopped short.

### Per sub-question

**a) Variety and origin** — 15 marks
- **Strengths:** You committed to Mosel Riesling and showed the elimination.
- **Could improve:** Name the sub-region.
- **Estimated:** 11/15 marks

**b) Quality** — 20 marks
- **Strengths:** You noticed the concentration.
- **Could improve:** "Very good" is not an assessment — name the Prädikat tier.
- **Estimated:** 9/20 marks

[[IMG:mosel-slate]]

<!-- SECTION_MARKS {"sectionA":{"awarded":11,"outOf":15},"sectionB":{"awarded":9,"outOf":20}} -->`;

describe("the assessment fingerprint", () => {
  it("captures everything a re-voicing must not move", () => {
    const f = fingerprintAssessment(NEUTRAL);
    expect(f.verdicts).toEqual(["BORDERLINE"]);
    expect(f.fractions).toEqual(["11/15", "9/20"]);
    expect(f.markPhrases).toEqual(["28-32|50"]);
    // Three: "## In the Glass", "### Overall Assessment", "### Per sub-question". The "**a) …**"
    // sub-question labels are bold text, not headings — they are covered by the bullet count and
    // by the fractions beneath them.
    expect(f.headings).toHaveLength(3);
    expect(f.imageTokens).toEqual(["[[IMG:mosel-slate]]"]);
    expect(f.machineTags).toHaveLength(1);
    // Six: Strengths / Could improve / Estimated, for each of the two sub-questions.
    expect(f.bullets).toBe(6);
  });

  it("passes a rewrite that only changes wording", () => {
    // The Cellar Rat's version of the same marks: every number, heading, bullet and token intact.
    const styled = NEUTRAL.replace(
      "The identification was sound but the quality answer stopped short.",
      "You found the wine, then reviewed it like a hotel breakfast."
    )
      .replace("You noticed the concentration.", "You noticed the concentration. Well done, genuinely.")
      .replace('"Very good" is not an assessment', '"Very good" is not an assessment, it is a shrug');
    expect(assessmentDrift(fingerprintAssessment(NEUTRAL), fingerprintAssessment(styled))).toEqual([]);
  });

  it("catches a softened verdict", () => {
    const styled = NEUTRAL.replace("**Result: BORDERLINE**", "**Result: PASS**");
    expect(assessmentDrift(fingerprintAssessment(NEUTRAL), fingerprintAssessment(styled))[0]).toMatch(/verdicts/);
  });

  it("catches a nudged mark", () => {
    const styled = NEUTRAL.replace("**Estimated:** 9/20 marks", "**Estimated:** 12/20 marks");
    expect(assessmentDrift(fingerprintAssessment(NEUTRAL), fingerprintAssessment(styled)).join(" ")).toMatch(/fractions/);
  });

  it("catches a moved total", () => {
    const styled = NEUTRAL.replace("28-32 out of 50", "34-38 out of 50");
    expect(assessmentDrift(fingerprintAssessment(NEUTRAL), fingerprintAssessment(styled)).join(" ")).toMatch(/markPhrases/);
  });

  it("catches a DROPPED FINDING — the failure the whole feature risks", () => {
    // A voice that spends its budget on jokes and quietly loses a criticism is the exact harm the
    // two-pass split exists to prevent. One fewer bullet, same numbers, and the gate still fires.
    const styled = NEUTRAL.replace('- **Could improve:** Name the sub-region.\n', "");
    expect(assessmentDrift(fingerprintAssessment(NEUTRAL), fingerprintAssessment(styled)).join(" ")).toMatch(/bullets/);
  });

  it("catches an ADDED finding invented to be funny about", () => {
    const styled = NEUTRAL.replace(
      "- **Could improve:** Name the sub-region.",
      "- **Could improve:** Name the sub-region.\n- **Could improve:** Your handwriting is a war crime."
    );
    expect(assessmentDrift(fingerprintAssessment(NEUTRAL), fingerprintAssessment(styled)).join(" ")).toMatch(/bullets/);
  });

  it("catches a reworded heading, because the UI parses them", () => {
    const styled = NEUTRAL.replace("### Overall Assessment", "### The Damage");
    expect(assessmentDrift(fingerprintAssessment(NEUTRAL), fingerprintAssessment(styled)).join(" ")).toMatch(/headings/);
  });

  it("catches a mangled image token or machine tag", () => {
    expect(
      assessmentDrift(
        fingerprintAssessment(NEUTRAL),
        fingerprintAssessment(NEUTRAL.replace("[[IMG:mosel-slate]]", "[[IMG:slate]]"))
      ).join(" ")
    ).toMatch(/imageTokens/);
    expect(
      assessmentDrift(
        fingerprintAssessment(NEUTRAL),
        fingerprintAssessment(NEUTRAL.replace('"awarded":9', '"awarded":14'))
      ).join(" ")
    ).toMatch(/machineTags/);
  });

  it("tolerates re-wrapping, which is not a change to the assessment", () => {
    // Whitespace inside a mark phrase must not read as drift, or the gate would reject every
    // rewrite that reflowed a line and the feature would silently never apply.
    const styled = NEUTRAL.replace("**Estimated marks: 28-32 out of 50**", "**Estimated marks: 28 - 32 out of 50**");
    expect(assessmentDrift(fingerprintAssessment(NEUTRAL), fingerprintAssessment(styled))).toEqual([]);
  });
});

describe("which surfaces the two-pass split covers", () => {
  it("grades every marked surface in the neutral voice, whatever the candidate chose", () => {
    for (const p of PERSONAS) {
      expect(resolvePersonaFor(p.id, "grading"), p.id).toBe(DEFAULT_PERSONA);
      expect(resolvePersonaFor(p.id, "oneliner"), p.id).toBe(DEFAULT_PERSONA);
    }
  });

  it("re-voices the long-form debrief but not the rapid drill", () => {
    // Flash Notes is one 45-word line per card; a second call would roughly double the latency of
    // the surface whose whole point is speed. Documented in personas.ts, asserted here so it is a
    // decision rather than an oversight.
    expect(gradedRestyleEnabled("grading")).toBe(true);
    expect(gradedRestyleEnabled("oneliner")).toBe(false);
  });
});
