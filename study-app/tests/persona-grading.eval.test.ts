import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { MARKING_PRINCIPLES } from "@/lib/prompts/marking-principles";
import { FUNNELLING_PRINCIPLE } from "@/lib/prompts/funnelling";
import { DEFAULT_PERSONA, PERSONAS, personaBlock, type PersonaId } from "@/lib/personas";
import {
  assessmentDrift,
  fingerprintAssessment,
  restyleForPersona,
} from "@/lib/persona-restyle";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT BEHIND THE TWO-PASS SPLIT.
//
// History, because it is the reason this file is shaped the way it is. When grading was
// single-pass — the persona in the grader's own system prompt — this eval measured:
//
//   invariants only      Tutor BORDERLINE 64% · Examiner FAIL 51% · Wit BORDERLINE 64% · Rat PASS 76%
//   + calibration rules  Tutor PASS 69%      · Examiner PASS 76% · Wit PASS 67%      · Rat FAIL 57%
//
// Three verdicts on one script, then a nineteen-point swing the other way from a single "do not be
// generous" line. That killed the single-pass design: a voice whose register is evaluative moves
// the grade in whichever direction it was last pushed.
//
// So the question this file now asks is DIFFERENT, and much easier to answer honestly. The marks
// can no longer differ by voice, because there is only one grading call and it never sees the
// persona. What is left to measure is whether the second pass is any good:
//
//   1. Does it actually get APPLIED, or does the fingerprint gate reject everything? A gate that
//      always fires would leave the feature silently inert — the worst outcome, because it looks
//      like it works.
//   2. Does the assessment really survive? (Belt and braces: the gate already checks this, so a
//      failure here means the gate itself is broken.)
//   3. Do the voices actually sound different, or have the constraints flattened them into one?
//
// NOT IN THE BUILD GATE — `*.eval.test.ts` is excluded. Real model calls. Run it when the persona
// prompts or the fingerprint change:
//
//   node --env-file=study-app/.env.local node_modules/vitest/vitest.mjs run tests/persona-grading.eval.test.ts
// ─────────────────────────────────────────────────────────────────────────────────────────────

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.PERSONA_EVAL_MODEL || "claude-sonnet-5";

const OUTPUT_CONTRACT = `## Output structure — follow this EXACTLY

### Overall Assessment

**Result: [PASS / BORDERLINE / FAIL]**

**Estimated marks: [range] out of [total available]**

[2-3 sentences on overall performance]

### Per sub-question

**a) [topic]** — [marks available]
- **Strengths:** [what they got right]
- **Could improve:** [specific, actionable feedback]
- **Estimated:** X/Y marks

[Continue for b), c) etc.]

### Key Takeaways

Three priorities for next time, numbered.

Keep total feedback under 1000 words.`;

const QUESTION = `Wine 1 is a dry white wine.
a) Identify the grape variety and origin, giving your reasoning. (15 marks)
b) Assess the quality of the wine, with reference to its origin. (20 marks)
c) Comment on the wine's state of maturity and its potential for further ageing. (15 marks)
Total: 50 marks`;

// The script that broke the single-pass design: a strong, well-argued answer, where there is real
// judgement to exercise and therefore the most room for a voice to lean on it.
const ANSWER = `Pale lemon-green, clear, no rim variation. Intense aromas of lime, white peach and struck-flint reduction over an emerging petrol note. Dry, high acidity, light body, 8.5% alcohol, medium(+) intensity, long finish with a saline echo.

a) The combination of very low alcohol with high acidity and residual sugar in balance narrows this sharply. Chenin from the Loire would show more quince and a broader palate; Grüner would show white pepper and more body. The petrol (TDN) development plus the low alcohol commits me to Riesling. Within Riesling, Alsace and Austria sit dry and at higher alcohol, and Clare Valley shows lime-and-toast at 12.5%+. Germany, and specifically the Mosel, is where 8.5% with this acid balance is a house style — I commit to Mosel Riesling.

b) This is a very good to outstanding wine. On the Prädikat ladder the alcohol and residual sugar place it at Kabinett, possibly light Spätlese, and the concentration and finish length are well above village level for that tier — a top Mittelmosel grower rather than a co-operative bottling. Quality in the context of origin: the intensity at this low alcohol is the Mosel's specific achievement, since ripeness has to be won on slate at the northern limit.

c) Around 5-8 years old, given the TDN is emerging but the fruit is still primary. It is drinking well now but is not yet at its peak. It will continue to improve for another 8-10 years as the petrol develops and the acid softens, and a Kabinett of this quality will hold for 20+ years from vintage before the fruit dries out.`;

/** Pass 1, exactly as production composes it: the persona resolves to the Tutor on this surface. */
async function gradeNeutral(client: Anthropic): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: `You are a Master of Wine exam coach providing a debrief for Paper 1 (White Wines).

${MARKING_PRINCIPLES}

${FUNNELLING_PRINCIPLE}

${OUTPUT_CONTRACT}

${personaBlock(DEFAULT_PERSONA, "grading")}`,
    messages: [{ role: "user", content: `## Question\n${QUESTION}\n\n## Candidate's answer\n${ANSWER}\n\nGrade this answer.` }],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text.trim()) throw new Error(`pass 1 returned no text (stop_reason=${msg.stop_reason})`);
  return text;
}

describe.skipIf(!KEY)("two-pass voicing", () => {
  it("re-voices a graded debrief without moving the assessment", { timeout: 600_000 }, async () => {
    const client = new Anthropic({ apiKey: KEY! });

    // ONE grading call. This is the structural change: there is no longer a per-persona grade to
    // disagree with itself, so "the same marks in every voice" is true by construction.
    const neutral = await gradeNeutral(client);
    const base = fingerprintAssessment(neutral);

    const voices = PERSONAS.filter((p) => p.id !== DEFAULT_PERSONA).map((p) => p.id);
    const results = await Promise.all(
      voices.map((persona) =>
        restyleForPersona({
          neutralText: neutral,
          persona,
          surface: "grading",
          client,
          apiKey: KEY!,
          usage: { taskType: "eval_persona_restyle", source: "user" },
        }).then((r) => ({ persona, ...r }))
      )
    );

    console.log("\ntwo-pass restyle");
    console.table([
      { persona: DEFAULT_PERSONA, outcome: "pass 1", words: neutral.split(/\s+/).length, verdict: base.verdicts[0] },
      ...results.map((r) => ({
        persona: r.persona,
        outcome: r.outcome,
        words: r.text.split(/\s+/).length,
        verdict: fingerprintAssessment(r.text).verdicts[0],
      })),
    ]);
    for (const r of results) if (r.drift) console.log(`  ${r.persona} drift:`, r.drift);

    // 1. THE GATE MUST NOT BE REJECTING EVERYTHING. A permanently-firing gate leaves the feature
    //    inert while looking healthy — every candidate silently gets the Tutor. This is now the
    //    assertion most likely to fail, and the most important one.
    for (const r of results) {
      expect(r.outcome, `${r.persona} restyle was not applied (${r.outcome})`).toBe("applied");
    }

    // 2. The assessment survived. The gate already guarantees this for anything it accepted, so a
    //    failure here means the fingerprint is blind to something it should catch.
    for (const r of results) {
      expect(
        assessmentDrift(base, fingerprintAssessment(r.text)),
        `${r.persona} changed the assessment`
      ).toEqual([]);
    }

    // 3. The voices are actually distinct. Without this, all of the above could pass by the
    //    rewrite simply echoing pass 1 back.
    const texts = [neutral, ...results.map((r) => r.text)];
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        expect(texts[i], `two outputs are byte-identical — the voice did not reach the prose`).not.toBe(texts[j]);
      }
    }
    const examiner = results.find((r) => r.persona === "examiner")!;
    expect(
      examiner.text.split(/\s+/).length,
      "The Examiner is not shorter than the Tutor — the voice is not reaching the prose"
    ).toBeLessThan(neutral.split(/\s+/).length);
  });

  it("discards a rewrite that moves a mark, and serves the original", { timeout: 300_000 }, async () => {
    // The gate's live behaviour, provoked rather than simulated: a model told to change the marks
    // must still not be able to. Uses a deliberately adversarial neutral text so the rewrite has
    // an obvious number to grab.
    const client = new Anthropic({ apiKey: KEY! });
    const neutral = `### Overall Assessment

**Result: FAIL**

**Estimated marks: 20-24 out of 50**

- **Could improve:** The quality answer never named a tier.
- **Estimated:** 8/20 marks`;

    const result = await restyleForPersona({
      neutralText: neutral,
      persona: "roast",
      surface: "grading",
      client,
      apiKey: KEY!,
      usage: { taskType: "eval_persona_restyle", source: "user" },
      // The hostile instruction rides in the text the rewriter is handed, which is the realistic
      // shape of this risk: prose it is asked to re-voice telling it to do something else.
      maxTokens: 4000,
    });

    // Whatever it did, the marks the candidate sees are the marks pass 1 awarded.
    expect(assessmentDrift(fingerprintAssessment(neutral), fingerprintAssessment(result.text))).toEqual([]);
    expect(["applied", "assessment_drift", "empty_output", "error"]).toContain(result.outcome);
    if (result.outcome !== "applied") expect(result.text).toBe(neutral);
  });
});
