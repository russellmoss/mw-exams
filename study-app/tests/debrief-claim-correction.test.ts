/**
 * The answer-key claim check WIRED INTO the debrief stream (produceFullEvaluation).
 *
 * The rule itself is unit-tested in answer-key-claims.test.ts. What this file pins is the wiring —
 * the part that #103 shipped without and that validator-rules-have-callers.test.ts exists to catch:
 *
 *   1. A clean debrief costs nothing extra: no correction call at all.
 *   2. A debrief asserting something the key contradicts gets ONE correction call, and the corrected
 *      prose reaches the client through the `{enriched}` frame — the only frame use-streaming.ts
 *      treats as authoritative, and therefore the only one that fixes what gets PERSISTED. Push the
 *      correction anywhere else and the candidate keeps reading (and saving) the wrong claim.
 *   3. The failure reason is handed to the telemetry recorder, so a rule that fires constantly and
 *      fixes nothing is distinguishable from one that works (migration 064).
 *   4. A corrector that throws does not cost the candidate their debrief.
 *
 * The flight here is the fb_188 case: an Alsace Pinot Gris banker beside an Alsace Sylvaner, which
 * the key reads as a curveball because Sylvaner is not one of Alsace's noble grapes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Anthropic: a scripted stream for the debrief, and a scripted create() for the correction pass ──
const streamText = vi.fn<() => string>(() => "");
const correctionText = vi.fn<() => string>(() => "");
const createCalls: unknown[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = {
      stream: async () => {
        const text = streamText();
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: "content_block_delta", delta: { type: "text_delta", text } };
          },
          finalMessage: async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }),
        };
      },
      create: async (args: unknown) => {
        createCalls.push(args);
        return {
          content: [{ type: "text", text: correctionText() }],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    };
  }
  return { default: FakeAnthropic };
});

// ── The keyed flight: what deriveStemKey would resolve for this pair of Alsace wines. ──
// The STORED answer key — the only place a keyed `role` lives, and therefore the only thing that lets
// Rule 1 enforce instead of flag. produce.ts must prefer this over the live re-derivation below, which
// rebuilds the flight from wine labels and can never carry a role.
const storedGroundTruth: unknown[] = [
  { slot: 1, varieties: ["Pinot Gris"], region: "Alsace", country: "France", role: "banker", role_source: "generator" },
  { slot: 2, varieties: ["Sylvaner"], region: "Alsace", country: "France", role: "curveball", role_source: "generator" },
];
let storedKeyLookups = 0;
vi.mock("@/lib/db", () => ({
  getAnswerKeyGroundTruth: async () => {
    storedKeyLookups += 1;
    return storedGroundTruth;
  },
}));

// The live re-derivation. Deliberately carries NO role, so any test that depends on a role proves the
// stored key was the source — if produce.ts ever overwrote the stored flight with this one, Rule 1
// would silently fall back to soft and the role tests below would go red.
vi.mock("@/lib/stem-answer-key", () => ({
  deriveStemKey: () => ({
    ground: [
      { slot: 1, varieties: ["Pinot Gris"], region: "Alsace", country: "France", is_blend: false },
      { slot: 2, varieties: ["Sylvaner"], region: "Alsace", country: "France", is_blend: false },
    ],
    plausible: [],
    source: {},
    ok: true,
    problems: [],
  }),
}));

// ── Telemetry: keep extractGradingMeta REAL (it strips the hidden tag the rule would otherwise read
//    as prose); capture what the recorder is handed so the persistence contract is assertable. ──
const recorded: { meta: unknown; ctx: Record<string, unknown> }[] = [];
vi.mock("@/lib/grading-telemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grading-telemetry")>()),
  recordGradingOverrideCheck: async (meta: unknown, ctx: Record<string, unknown>) => {
    recorded.push({ meta, ctx });
  },
}));

// ── Everything else the producer touches that would otherwise reach a file, a model or the DB. ──
vi.mock("@/lib/model-selector", () => ({
  selectModel: async () => ({ model: "claude-opus-5", abGroup: null, tier: "opus" }),
}));
vi.mock("@/lib/usage-log", () => ({ logClaudeUsage: () => {} }));
vi.mock("@/lib/thinking-stream", () => ({
  withThinking: async () => ({}),
  thinkingFrame: (t: string) => `data: ${JSON.stringify({ k: t })}\n\n`,
}));
vi.mock("@/lib/wine-terms", () => ({ loadWineTerms: () => [] }));
vi.mock("@/lib/master-trees", () => ({ masterTreeForPaper: () => "" }));
vi.mock("@/lib/prompts/tasting-lexicon", () => ({
  scanDislikedWording: () => [],
  buildLexiconCritiqueGuidance: () => "",
}));
vi.mock("@/lib/media", () => ({
  IMAGE_TOKEN_INSTRUCTIONS: "",
  INFOGRAPHIC_INSTRUCTIONS: "",
  // Identity enrichment: the point here is WHICH text reaches the frame, not what images do to it.
  enrichFeedbackWithImages: async (text: string) => text,
  createImageStreamer: () => ({ feed: () => {}, flush: async () => {} }),
  deriveWineSubjects: () => [],
  answerImageConstraint: () => "",
}));

import { produceFullEvaluation } from "../src/app/api/evaluate-full/produce";

const WINES = [
  { slot: 1, fullText: "Alsace Pinot Gris 2019" },
  { slot: 2, fullText: "Alsace Sylvaner 2020" },
];

async function runDebrief(): Promise<{ frames: Record<string, unknown>[]; saved: string | null }> {
  let saved: string | null = null;
  const stream = await produceFullEvaluation({
    apiKey: "test-key",
    userId: 1,
    questionText: "Wines 1 and 2 are from the same region. Identify each. (25 marks each)",
    questionId: "gen_p1_F2_test",
    paper: 1,
    wines: WINES,
    inputMethod: "typed",
    userAnswer: "Wine 1 Alsace Pinot Gris; wine 2 Alsace Riesling.",
    onComplete: async (finalText) => {
      saved = finalText;
    },
  });
  const raw = await new Response(stream).text();
  const frames = raw
    .split("\n")
    .filter((l) => l.startsWith("data: ") && l.slice(6) !== "[DONE]")
    .map((l) => {
      try {
        return JSON.parse(l.slice(6)) as Record<string, unknown>;
      } catch {
        return {};
      }
    });
  return { frames, saved };
}

const enrichedFrame = (frames: Record<string, unknown>[]) =>
  frames.filter((f) => typeof f.enriched === "string").map((f) => f.enriched as string);

beforeEach(() => {
  createCalls.length = 0;
  recorded.length = 0;
  storedKeyLookups = 0;
  vi.clearAllMocks();
});

describe("the debrief's answer-key claim check", () => {
  it("leaves a clean debrief alone and never pays for a correction", async () => {
    streamText.mockReturnValue(
      "Wine 1 is the banker, a benchmark Alsace Pinot Gris. Wine 2 is the curveball.\n\nResult: PASS"
    );

    const { frames, saved } = await runDebrief();

    expect(createCalls).toHaveLength(0);
    expect(enrichedFrame(frames)[0]).toContain("Wine 2 is the curveball");
    expect(saved).toContain("Result: PASS");
    // Nothing to store: a clean draft records no claim reason.
    expect(recorded[0]?.ctx.claims).toMatchObject({
      originalFailureReason: null,
      regenerated: false,
    });
  });

  it("corrects a mislabelled role once and serves the CORRECTED prose as authoritative (fb_188)", async () => {
    // The exact defect the candidate reported: the Sylvaner called a banker.
    streamText.mockReturnValue(
      "Wine 2 is the banker here — Alsace Sylvaner is a safe benchmark.\n\nResult: BORDERLINE"
    );
    correctionText.mockReturnValue(
      "Wine 2 is the curveball here — Alsace Sylvaner is not one of the noble grapes.\n\nResult: BORDERLINE"
    );

    const { frames, saved } = await runDebrief();

    // ONE correction pass, and it was told what to fix.
    expect(createCalls).toHaveLength(1);
    const call = createCalls[0] as { system: string; messages: { content: string }[] };
    expect(call.system).toMatch(/must NOT change/i);
    expect(call.messages[0].content).toMatch(/answer key contradicts/i);
    expect(call.messages[0].content).toMatch(/keys it as a curveball/i);

    // The corrected text is what the client is told to keep, and what onComplete persists.
    const enriched = enrichedFrame(frames);
    expect(enriched).toHaveLength(1);
    expect(enriched[0]).toContain("the curveball");
    expect(enriched[0]).not.toContain("is the banker");
    expect(saved).toContain("the curveball");
    // The verdict survived the rewrite — a claim fix must never move the mark.
    expect(saved).toContain("Result: BORDERLINE");

    // And the fire is recorded, including that the correction actually took.
    expect(recorded[0]?.ctx.claims).toMatchObject({
      regenerated: true,
      correctionFailed: false,
      failureReason: null,
    });
    expect((recorded[0]?.ctx.claims as { originalFailureReason: string }).originalFailureReason).toMatch(
      /banker/i
    );
  });

  it("rejects an absolute production-method claim about a mixed-method category (fb_175)", async () => {
    streamText.mockReturnValue("Prosecco is not traditional method, so that comparison fails.\n\nResult: FAIL");
    correctionText.mockReturnValue(
      "Prosecco is largely tank method, though a quality slice is traditional method.\n\nResult: FAIL"
    );

    const { saved } = await runDebrief();

    expect(createCalls).toHaveLength(1);
    expect(saved).toContain("though a quality slice is traditional method");
    expect((recorded[0]?.ctx.claims as { violations: { rule: string }[] }).violations.map((v) => v.rule))
      .toContain("answer-key-claim-method");
  });

  it("keeps the debrief when the corrector fails, and still stores the reason", async () => {
    streamText.mockReturnValue("Wine 2 is the banker — Alsace Sylvaner.\n\nResult: FAIL");
    correctionText.mockImplementation(() => {
      throw new Error("model overloaded");
    });

    const { frames, saved } = await runDebrief();

    // The candidate keeps a debrief rather than losing it to a failed fix.
    expect(saved).toContain("Wine 2 is the banker");
    expect(enrichedFrame(frames)[0]).toContain("Wine 2 is the banker");
    expect(recorded[0]?.ctx.claims).toMatchObject({ correctionFailed: true, regenerated: false });
    expect((recorded[0]?.ctx.claims as { failureReason: string }).failureReason).toMatch(/banker/i);
  });

  it("reads the STORED answer key, which is the only source of a keyed role", async () => {
    // Without this the roles come from the live re-derivation, which has none, and Rule 1 silently
    // degrades to a review flag no matter how many roles are keyed.
    streamText.mockReturnValue("Wine 2 is the banker — Alsace Sylvaner.\n\nResult: FAIL");
    correctionText.mockReturnValue("Wine 2 is the curveball — Alsace Sylvaner.\n\nResult: FAIL");

    const { saved } = await runDebrief();

    expect(storedKeyLookups).toBe(1);
    // Enforced, not merely flagged: a correction pass ran and the corrected prose shipped.
    expect(createCalls).toHaveLength(1);
    expect(saved).toContain("the curveball");
    expect((recorded[0]?.ctx.claims as { violations: { severity: string }[] }).violations[0].severity).toBe("hard");
  });

  it("strips the hidden GRADING_META tag before validating, so the tag is not read as prose", async () => {
    streamText.mockReturnValue(
      "Wine 1 is the banker, a benchmark Alsace Pinot Gris.\n\nResult: PASS\n" +
        '<!-- GRADING_META {"verdict":"PASS","howlerPresent":false,"howler":null,"cascadeFlag":false} -->'
    );

    const { saved } = await runDebrief();

    expect(createCalls).toHaveLength(0);
    expect(saved).not.toContain("GRADING_META");
    expect(recorded[0]?.meta).toMatchObject({ verdict: "PASS" });
  });
});
