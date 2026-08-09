import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { MARKING_PRINCIPLES } from "@/lib/prompts/marking-principles";
import { FUNNELLING_PRINCIPLE } from "@/lib/prompts/funnelling";
import { DEFAULT_PERSONA, personaBlock } from "@/lib/personas";
import { bandForScore } from "@/lib/marking-bands";
import { extractGradingMeta, GRADING_META_INSTRUCTION } from "@/lib/grading-telemetry";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// HOW STABLE IS THE GRADER? Same script, same prompt, K runs.
//
// This exists because a candidate re-submitting identical work must not cross the pass line on a
// coin flip. It measures the thing directly rather than inferring it from anecdotes: the earlier
// observation that prompted this file was two runs on Sonnet returning PASS 69% and FAIL, which is
// suggestive but is n=2 with no controls.
//
// TEMPERATURE CANNOT BE PINNED on this model generation (it is a 400), so run-to-run spread is
// inherent and the question is only ever "how much". That makes the design of the OUTPUT the main
// lever available: the fewer independent decisions the model makes, the fewer places variance can
// enter. Hence `bandForScore` — the verdict is now derived from the marks in code rather than
// sampled as its own token (see lib/marking-bands.ts).
//
// NOT IN THE BUILD GATE. K real grading calls per tier; Opus is the production debrief tier and is
// the expensive one. Run deliberately:
//
//   ANTHROPIC_API_KEY=... GRADER_VARIANCE_K=5 \
//     node node_modules/vitest/vitest.mjs run tests/grader-variance.eval.test.ts
// ─────────────────────────────────────────────────────────────────────────────────────────────

const KEY = process.env.ANTHROPIC_API_KEY;
const K = Number(process.env.GRADER_VARIANCE_K || 5);
/** Comma-separated. Defaults to both tiers the app grades on. */
const TIERS = (process.env.GRADER_VARIANCE_MODELS || "claude-sonnet-4-6,claude-opus-5").split(",");

/** The spread we are willing to call acceptable, in percentage points of the total. */
const MAX_MARK_SPREAD = 15;

const QUESTION = `Wine 1 is a dry white wine.
a) Identify the grape variety and origin, giving your reasoning. (15 marks)
b) Assess the quality of the wine, with reference to its origin. (20 marks)
c) Comment on the wine's state of maturity and its potential for further ageing. (15 marks)
Total: 50 marks`;

// Deliberately a MID-BAND script: strong identification, thinner elsewhere. A clear pass or a clear
// fail would be stable for uninteresting reasons — the question is whether the grader is stable
// where the decision is actually close, because that is where a candidate's result is decided.
//
// AND DELIBERATELY FREE OF SELF-CONTRADICTION. The first version of this fixture called the wine
// "Dry" and then reasoned from "balancing residual sugar", which is a Cardinal Rule 10 structural
// contradiction — the grader flagged howler+cascade on 5 runs out of 5 and resolved every one to
// FAIL. That was the rule working exactly as written, not instability, and it masked the ordinary
// variance this file exists to measure. If you edit the answer below, re-read Rule 10 first.
const ANSWER = `Pale lemon-green, clear. Intense lime, white peach and struck-flint reduction over an emerging petrol note. Dry, high acidity, light body, 8.5% alcohol, long finish with a saline echo.

a) Very low alcohol with high acidity narrows this sharply. Chenin would show more quince and a broader palate; Grüner more white pepper and body. The TDN plus the low alcohol commits me to Riesling. Alsace and Austria sit drier and higher in alcohol, Clare shows lime-and-toast at 12.5%+. Germany, and specifically the Mosel, is where 8.5% with this acid balance is a house style — I commit to Mosel Riesling.

b) A very good wine. On the Prädikat ladder the alcohol places it around Kabinett, and the concentration is above village level for that tier. The intensity at this low alcohol is the Mosel's specific achievement, since ripeness has to be won on slate at the northern limit.

c) Around 5-8 years old — the TDN is emerging but the fruit is still primary. Drinking well now, not yet at peak. It should improve for another 8-10 years.`;

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

const SYSTEM = `You are a Master of Wine exam coach providing a debrief for Paper 1 (White Wines).

${MARKING_PRINCIPLES}

${FUNNELLING_PRINCIPLE}

${OUTPUT_CONTRACT}

${personaBlock(DEFAULT_PERSONA, "grading")}

${GRADING_META_INSTRUCTION}`;

interface Run {
  /** The verdict the model wrote in its prose. */
  stated: string | null;
  /** Its own howler/cascade self-report — the ONLY legitimate reason to state a band below the marks. */
  howler: boolean;
  cascade: boolean;
  /** Total marks as a percentage, from the per-sub-part fractions (the auditable number). */
  partsPct: number | null;
  /** The band those parts imply, via the shared mapping. */
  derived: string | null;
}

function parseRun(text: string): Run {
  const v = text.match(/\*\*Result:\s*\**\s*(PASS|BORDERLINE|FAIL)/i);
  // `(\d+)(?:[-–—](\d+))?/(\d+)` — the optional middle group is the range Sonnet emits. Without
  // it this matched nothing at all on that tier and reported a flattering 0.0pp spread.
  const fractions = [...text.matchAll(/Estimated:?\**\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*\/\s*(\d+)/gi)].map(
    (m) => {
      const lo = Number(m[1]);
      const hi = m[2] ? Number(m[2]) : lo;
      return [(lo + hi) / 2, Number(m[3])] as [number, number];
    }
  );
  let partsPct: number | null = null;
  if (fractions.length) {
    const got = fractions.reduce((s, [a]) => s + a, 0);
    const outOf = fractions.reduce((s, [, b]) => s + b, 0);
    if (outOf > 0) partsPct = (got / outOf) * 100;
  }
  const { meta } = extractGradingMeta(text);
  return {
    stated: v ? v[1].toUpperCase() : null,
    howler: meta?.howlerPresent === true,
    cascade: meta?.cascadeFlag === true,
    partsPct,
    derived: partsPct == null ? null : bandForScore(partsPct).toUpperCase(),
  };
}

async function grade(client: Anthropic, model: string): Promise<Run> {
  const msg = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      { role: "user", content: `## Question\n${QUESTION}\n\n## Candidate's answer\n${ANSWER}\n\nGrade this answer.` },
    ],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text.trim()) throw new Error(`no text (stop_reason=${msg.stop_reason})`);
  return parseRun(text);
}

describe.skipIf(!KEY)("grader variance", () => {
  for (const model of TIERS) {
    it(`is stable across ${K} runs of one script — ${model}`, { timeout: 900_000 }, async () => {
      const client = new Anthropic({ apiKey: KEY! });
      const runs = await Promise.all(Array.from({ length: K }, () => grade(client, model)));

      const pcts = runs.map((r) => r.partsPct).filter((p): p is number => p != null);
      const spread = pcts.length ? Math.max(...pcts) - Math.min(...pcts) : 0;
      const stated = new Set(runs.map((r) => r.stated));
      const derived = new Set(runs.map((r) => r.derived));

      console.log(`\n${model} — ${K} runs of one script`);
      console.table(
        runs.map((r, i) => ({
          run: i + 1,
          "parts %": r.partsPct == null ? "—" : r.partsPct.toFixed(1),
          "stated verdict": r.stated ?? "—",
          "derived band": r.derived ?? "—",
          howler: r.howler,
          cascade: r.cascade,
        }))
      );
      console.log(
        `  mark spread ${spread.toFixed(1)}pp · stated verdicts {${[...stated].join(", ")}} · derived {${[...derived].join(", ")}}`
      );

      // Every run has to be parseable, or the numbers above mean nothing.
      expect(runs.every((r) => r.partsPct != null), "a run produced no per-part marks").toBe(true);

      // THE HEADLINE: does a candidate's result depend on the roll? Asserted on the DERIVED band,
      // because that is what the app will show once the verdict is computed from the marks rather
      // than sampled independently. A failure here is a real defect, not a flaky test.
      expect(
        [...derived],
        `derived band differs across identical runs: ${runs.map((r) => `${r.partsPct?.toFixed(0)}%→${r.derived}`).join(", ")}`
      ).toHaveLength(1);

      // The underlying marks may wobble; how much is the thing being tracked over time.
      expect(spread, `mark spread ${spread.toFixed(1)}pp across identical runs`).toBeLessThanOrEqual(
        MAX_MARK_SPREAD
      );

      // The prose verdict should already agree with the arithmetic. Where it does not, the model
      // has contradicted its own marks — which is exactly why the app derives rather than trusts it.
      const disagreements = runs.filter((r) => r.stated && r.derived && r.stated !== r.derived);
      if (disagreements.length) {
        console.log(
          `  NOTE: ${disagreements.length}/${K} runs stated a verdict their own marks do not support`
        );
      }
    });
  }
});
