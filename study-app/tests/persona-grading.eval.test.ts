import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { MARKING_PRINCIPLES } from "@/lib/prompts/marking-principles";
import { FUNNELLING_PRINCIPLE } from "@/lib/prompts/funnelling";
import { PERSONAS, personaBlock, type PersonaId } from "@/lib/personas";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT persona-invariants.test.ts CANNOT MAKE.
//
// That test proves the invariant TEXT is present in every voice. This one proves the model
// OBEYS it: the same answer, graded under all four voices, must land on the same verdict,
// materially the same mark, and must still name every error the neutral voice named.
//
// The failure being hunted is specific and plausible. Tell a grader "be blunt, cut the padding"
// and the cheapest way for it to comply is to report fewer things — at which point the persona
// dial is secretly a difficulty dial, and the Settings page's promise ("every voice gives you the
// same marks and every last finding") is false. The roast voice has the mirror risk: spending its
// output budget on jokes and dropping a finding to make room.
//
// NOT IN THE BUILD GATE — `*.eval.test.ts` is excluded from `test:build-gate`. It costs real model
// calls (12 by default) and, like any LLM eval, it is sampling a distribution rather than checking
// a pure function. Run it when the persona prompts change:
//
//   node --env-file=study-app/.env.local node_modules/vitest/vitest.mjs run tests/persona-grading.eval.test.ts
//
// WHAT IT GRADES WITH. The prompt below is the practical marking rubric as `/api/evaluate-full`
// composes it — MARKING_PRINCIPLES, then FUNNELLING_PRINCIPLE, then the output contract, then the
// persona block last. It is a faithful reconstruction, not a call into produce.ts, because that
// function's prompt is assembled inline from a dozen request-scoped inputs and reaching it would
// mean a route, a database and an attempt row. What it does share with production is the part
// under test: the same rubric constant, in the same order, with the persona appended in the same
// position. If evaluate-full's composition order ever changes, change it here too.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.PERSONA_EVAL_MODEL || "claude-sonnet-5";

/** Marks may move a little between voices — wording changes sampling. This much is noise. */
const MARK_TOLERANCE = 8;

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

function buildPrompt(persona: PersonaId): string {
  return `You are a Master of Wine exam coach providing a debrief for Paper 1 (White Wines).

${MARKING_PRINCIPLES}

${FUNNELLING_PRINCIPLE}

${OUTPUT_CONTRACT}

${personaBlock(persona, "grading", { bypassSurfaceGate: true })}`;
}
// bypassSurfaceGate because GRADING_PERSONAS_ENABLED currently pins graded surfaces to the Tutor.
// This eval is the gate that decides when that flag may be flipped, so it must measure the voices
// the flag is suppressing — otherwise it would grade four identical prompts and pass vacuously.

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────
//
// One question, three answers chosen to sit at different points of the band, because a tone
// effect could plausibly show up at one end only — a blunt voice being harsher on a weak script,
// a funny one being softer on a strong one.

const QUESTION = `Wine 1 is a dry white wine.
a) Identify the grape variety and origin, giving your reasoning. (15 marks)
b) Assess the quality of the wine, with reference to its origin. (20 marks)
c) Comment on the wine's state of maturity and its potential for further ageing. (15 marks)
Total: 50 marks`;

interface Fixture {
  name: string;
  answer: string;
  /**
   * Errors the neutral voice reliably catches. Every voice must still name each one — this is the
   * "every finding survives" claim, and it is the assertion that actually matters. Each entry is
   * satisfied if ANY of its patterns appears.
   */
  mustName: { label: string; patterns: RegExp[] }[];
}

const FIXTURES: Fixture[] = [
  {
    name: "weak — vague quality, no tier, no maturity timeframes",
    answer: `Pale lemon with a green tinge. Aromas of citrus, green apple and a bit of wet stone. High acidity, light body, around 11.5% alcohol, dry, medium finish.

a) This is Riesling from the Mosel in Germany. The high acidity and low alcohol point to a cool climate, and the wet stone note suggests slate soils.

b) This is a good quality wine. It is well made and balanced, with nice fruit and good acidity. A very good example of its type.

c) The wine is quite youthful. It could age for a while longer and would improve with time in bottle.`,
    mustName: [
      {
        // Cardinal Rule 3 — bare "good quality" earns nothing; the Prädikat tier was required.
        label: "quality not contextualised / official tier missing",
        patterns: [/prädikat|pradikat|kabinett|spätlese|spatlese|qualitätswein|qualitatswein/i, /official quality (level|tier)/i, /quality (tier|level|ladder|classification)/i],
      },
      {
        // Cardinal Rule 5 — a maturity answer needs concrete timeframes, not "a while longer".
        label: "maturity lacks concrete timeframes",
        patterns: [/timeframe|time frame|concrete|specific (years|timing)|how many years|\bno (specific )?(years|dates)\b/i, /vague/i],
      },
    ],
  },
  {
    name: "strong — argued ID, tiered quality, four-part maturity",
    answer: `Pale lemon-green, clear, no rim variation. Intense aromas of lime, white peach and struck-flint reduction over an emerging petrol note. Dry, high acidity, light body, 8.5% alcohol, medium(+) intensity, long finish with a saline echo.

a) The combination of very low alcohol with high acidity and residual sugar in balance narrows this sharply. Chenin from the Loire would show more quince and a broader palate; Grüner would show white pepper and more body. The petrol (TDN) development plus the low alcohol commits me to Riesling. Within Riesling, Alsace and Austria sit dry and at higher alcohol, and Clare Valley shows lime-and-toast at 12.5%+. Germany, and specifically the Mosel, is where 8.5% with this acid balance is a house style — I commit to Mosel Riesling.

b) This is a very good to outstanding wine. On the Prädikat ladder the alcohol and residual sugar place it at Kabinett, possibly light Spätlese, and the concentration and finish length are well above village level for that tier — a top Mittelmosel grower rather than a co-operative bottling. Quality in the context of origin: the intensity at this low alcohol is the Mosel's specific achievement, since ripeness has to be won on slate at the northern limit.

c) Around 5-8 years old, given the TDN is emerging but the fruit is still primary. It is drinking well now but is not yet at its peak. It will continue to improve for another 8-10 years as the petrol develops and the acid softens, and a Kabinett of this quality will hold for 20+ years from vintage before the fruit dries out.`,
    mustName: [
      {
        // Rule 1 — the reasoning is the point, and a strong funnel must be credited by name.
        label: "credits the reasoning / funnelling",
        patterns: [/funnel|reasoning|argument|elimination|derivation|narrow/i],
      },
    ],
  },
  {
    name: "howler — a parameter impossibility that must tip the band",
    answer: `Deep gold, viscous. Intense honey, apricot and botrytis. Sweet, high acidity, full body, very long.

a) This is Riesling from the Mosel, a botrytised Trockenbeerenauslese. The honeyed botrytis character and the sweetness make that clear.

b) Outstanding quality. TBA is the top of the Prädikat ladder and this shows the concentration to justify it.

c) At 15% alcohol this is a powerful wine that is drinking well now and will hold for decades.`,
    mustName: [
      {
        // A TBA at 15% abv is impossible — fermentation stalls far below that. Rule 10 + the
        // howler rule: no voice may let this pass unremarked.
        label: "flags the 15% alcohol impossibility on a TBA",
        patterns: [/15%|15 ?per ?cent|alcohol/i],
      },
      {
        label: "names it as a howler / theory error",
        patterns: [/howler|impossib|cannot|could not|contradict|theory error|inconsistent/i],
      },
    ],
  },
];

// ── Parsing ──────────────────────────────────────────────────────────────────────────────────

function parseVerdict(text: string): string | null {
  const m = text.match(/\*\*Result:\s*\**\s*(PASS|BORDERLINE|FAIL)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Midpoint of "Estimated marks: 28-32 out of 50", normalised to a percentage of the total. */
function parseMarkPct(text: string): number | null {
  const m = text.match(/Estimated marks:\s*\**\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*\**\s*(?:out of|\/)\s*\**\s*(\d+)/i);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] ? Number(m[2]) : lo;
  const total = Number(m[3]);
  if (!total) return null;
  return (((lo + hi) / 2) / total) * 100;
}

async function grade(persona: PersonaId, fixture: Fixture): Promise<string> {
  const client = new Anthropic({ apiKey: KEY! });
  const msg = await client.messages.create({
    model: MODEL,
    // Deliberately large, because max_tokens caps reasoning AND the answer together on a model
    // with adaptive thinking — the same trap flash-notes/grade documents. Measured, not guessed:
    // at 2,500 every hard fixture returned an empty content array, and at 8,000 the strong script
    // still spent the entire budget thinking (stop_reason=max_tokens, 0 text). A well-argued
    // answer is the most expensive thing to mark, because there is a real case to weigh on every
    // sub-part. Production has the same exposure and handles it the same way, via withThinking().
    max_tokens: 16000,
    // No `temperature` — it is deprecated on this model generation and a 400. So sampling noise
    // cannot be pinned to zero, which is exactly why the mark assertion is a tolerance band and
    // the verdict assertion is the load-bearing one: a verdict is a three-way choice that noise
    // does not flip on a script sitting clearly inside a band, whereas a mark estimate wanders a
    // point or two on its own. If this ever fails by a hair, re-run before believing it.
    system: buildPrompt(persona),
    messages: [
      {
        role: "user",
        content: `## Question\n${QUESTION}\n\n## Candidate's answer\n${fixture.answer}\n\nGrade this answer.`,
      },
    ],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  // Fail loudly on an empty completion rather than letting it reach the assertions as a null
  // verdict, which reads as "the persona broke the output format" when it is a budget problem.
  if (!text.trim()) {
    throw new Error(
      `${persona} returned no text (stop_reason=${msg.stop_reason}, out=${msg.usage?.output_tokens}). ` +
        `Raise max_tokens — reasoning is consuming the whole budget.`
    );
  }
  return text;
}

// ── The eval ─────────────────────────────────────────────────────────────────────────────────

describe.skipIf(!KEY)("persona does not move the grade", () => {
  for (const fixture of FIXTURES) {
    it(
      `holds verdict, marks and findings across all four voices — ${fixture.name}`,
      { timeout: 300_000 },
      async () => {
        const ids = PERSONAS.map((p) => p.id);
        const texts = await Promise.all(ids.map((id) => grade(id, fixture)));
        const byPersona = Object.fromEntries(ids.map((id, i) => [id, texts[i]])) as Record<PersonaId, string>;

        const rows = ids.map((id) => ({
          persona: id,
          verdict: parseVerdict(byPersona[id]),
          markPct: parseMarkPct(byPersona[id]),
          words: byPersona[id].split(/\s+/).length,
        }));
        // Printed unconditionally: when this fails, the table is the diagnosis, and when it passes
        // the word counts are the evidence that the voices really do differ in length.
        console.log(`\n${fixture.name}`);
        console.table(rows);

        // 1. Every voice produced a parseable, structured grade. A persona that reformats the
        //    output breaks the UI that parses these headings, not just the mood.
        for (const r of rows) {
          expect(r.verdict, `${r.persona} produced no parseable verdict`).not.toBeNull();
          expect(r.markPct, `${r.persona} produced no parseable mark`).not.toBeNull();
        }

        // 2. THE VERDICT IS IDENTICAL. This is the strongest form of the claim and the one the
        //    Settings page makes: PASS/BORDERLINE/FAIL cannot depend on the voice.
        const verdicts = new Set(rows.map((r) => r.verdict));
        expect(
          [...verdicts],
          `verdict differs by voice: ${rows.map((r) => `${r.persona}=${r.verdict}`).join(", ")}`
        ).toHaveLength(1);

        // 3. The mark barely moves. A tolerance rather than equality because wording genuinely
        //    changes the sample; a systematic gap wider than this is the difficulty dial appearing.
        const pcts = rows.map((r) => r.markPct!);
        const spread = Math.max(...pcts) - Math.min(...pcts);
        expect(
          spread,
          `marks spread ${spread.toFixed(1)} points across voices: ${rows.map((r) => `${r.persona}=${r.markPct!.toFixed(0)}%`).join(", ")}`
        ).toBeLessThanOrEqual(MARK_TOLERANCE);

        // 4. EVERY FINDING SURVIVES — the assertion the whole feature rests on. Brevity and
        //    comedy may both cost words; neither may cost a mark-costing error going unnamed.
        for (const req of fixture.mustName) {
          for (const id of ids) {
            const hit = req.patterns.some((p) => p.test(byPersona[id]));
            expect(hit, `${id} never named: ${req.label}`).toBe(true);
          }
        }
      }
    );
  }

  // A guard on the OTHER direction. If every voice produced near-identical prose, the personas are
  // not doing anything and the feature is decoration — a passing test above would be meaningless.
  it("still produces materially different prose", { timeout: 300_000 }, async () => {
    const fixture = FIXTURES[0];
    const ids = PERSONAS.map((p) => p.id);
    const texts = await Promise.all(ids.map((id) => grade(id, fixture)));
    const lengths = texts.map((t) => t.split(/\s+/).length);
    console.log("\nword counts:", Object.fromEntries(ids.map((id, i) => [id, lengths[i]])));

    // The Examiner is defined by concision; if it is not clearly shorter than The Tutor, the
    // persona is not reaching the output at all.
    const tutor = lengths[ids.indexOf("mentor")];
    const examiner = lengths[ids.indexOf("examiner")];
    expect(examiner, `Examiner (${examiner}w) is not shorter than Tutor (${tutor}w)`).toBeLessThan(tutor);

    // And no two voices may be near-identical strings.
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        expect(texts[i], `${ids[i]} and ${ids[j]} produced identical output`).not.toBe(texts[j]);
      }
    }
  });
});
