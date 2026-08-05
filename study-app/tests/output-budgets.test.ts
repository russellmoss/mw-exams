// output-budgets.test.ts — `max_tokens` must be sized on the MODEL, and sized in exactly one place.
//
// `max_tokens` caps thinking and visible response TOGETHER, and models on the adaptive-thinking list
// emit a thinking block whether or not one is requested — on Opus 4.7+/Sonnet 5 the default display
// is "omitted", so those tokens are spent AND invisible. Two separate defects came out of missing
// that, and both are pinned below.
//
// GENERATION. The budget was `thinkingOn ? 8000 : 4000`, where thinkingOn meant "a progress emitter
// is attached", so every non-streaming generation (study page, bank worker) sent a bare 4000 to a
// reasoning model. A probe of the real prompt at 4000 returned `content: [["thinking", 0]]` with
// stop_reason "max_tokens" — the whole budget eaten by reasoning, zero characters of question.
// Production over 14 days: Opus attempt 1 parse-failed 174/349 = 49.9%, against Sonnet's 0.8%.
//
// MODEL ANSWERS. One call emits four sections and truncation lands on the tail, so a cut response
// still parses — it just silently loses the annotation / reasoning trace / diagram assist. The cap has
// been raised twice on that evidence (4000 → 8000), and at 8000 it was still truncating: Opus 32/106
// calls at the cap (30.2%), Sonnet 17/113 (15.0%).
//
// The second describe block is the one that matters most over time. Four call sites each carried a
// hand-copied 8000, and model-answer-prompt.ts documents offline/production drift on this exact path
// as a recurring bug — so the guard is not "is the number big enough" but "is there still only one
// number".
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { generationMaxTokens, GENERATION_TIMING } from "../src/lib/question-engine";
import { modelAnswerMaxTokens } from "../src/lib/prompts/model-answer-prompt";
import { supportsAdaptiveThinking } from "../src/lib/model-capabilities";

// The arms the engine actually calls: selectModel(…, "opus") for attempt 1, hardcoded
// claude-sonnet-4-6 for every retry.
const GENERATION_MODELS = ["claude-opus-5", "claude-sonnet-4-6"];
const NON_REASONING = "claude-haiku-4-5-20251001";

describe("generationMaxTokens", () => {
  it.each(GENERATION_MODELS)("gives %s room for reasoning plus the question", (model) => {
    // Two probes of the live prompt spent 5,084 and 7,718 output tokens including thinking, so the
    // budget must clear the larger with margin — 8000 would have left 4%.
    expect(generationMaxTokens(model)).toBeGreaterThanOrEqual(12_000);
  });

  it("keeps the smaller budget for a model that cannot reason", () => {
    expect(supportsAdaptiveThinking(NON_REASONING)).toBe(false);
    expect(generationMaxTokens(NON_REASONING)).toBe(4_000);
  });
});

describe("modelAnswerMaxTokens", () => {
  it.each(GENERATION_MODELS)("clears the four-section package on %s", (model) => {
    // Sonnet 4.6 does not reason unless asked and still hit 8000 on 15% of calls, so the visible
    // package alone needs well past that; a reasoning model spends more before writing a word.
    expect(modelAnswerMaxTokens(model)).toBeGreaterThanOrEqual(16_000);
  });

  it("still gives a non-reasoning model room for the whole package", () => {
    expect(modelAnswerMaxTokens(NON_REASONING)).toBeGreaterThan(8_000);
  });

  it("stays inside the non-streaming transport ceiling", () => {
    // Every model-answer call site is non-streaming, where the SDK's HTTP timeout — not the model's
    // 128K output ceiling — is the real limit. Past ~16k a slow answer costs the whole call instead of
    // truncating. Raising this without moving those call sites to streaming trades one failure for a
    // worse one.
    for (const model of [...GENERATION_MODELS, NON_REASONING]) {
      expect(modelAnswerMaxTokens(model)).toBeLessThanOrEqual(16_000);
    }
  });
});

describe("generation timing is consistent with the token budget", () => {
  // These four numbers only make sense together. The bug they encode: a 45s per-call cap sat against
  // a token budget whose generations needed ~59s, so the MEDIAN Opus call was killed by the clock —
  // 77 attempts, 1 success. Any future edit that moves one without the others reopens it.
  const T = GENERATION_TIMING;

  it("gives a call time to produce what the token budget permits", () => {
    // Probes of the live prompt at the raised cap produced 5,084 / 5,710 / 7,718 output tokens
    // depending on effort; at the measured rate the slowest is ~113s (and it was measured at the API
    // default effort, above the `medium` the engine now sets — so this is the conservative bound).
    const slowestProbeMs = (7_718 / T.opusTokensPerSecond) * 1000;
    expect(T.callTimeoutMs).toBeGreaterThan(slowestProbeMs);
  });

  it("fits a slow first attempt plus a retry", () => {
    expect(T.budgetMs).toBeGreaterThanOrEqual(T.opusMinCallMs + T.minCallMs);
  });

  it("never demands more room to start than a call is ever granted", () => {
    // opusMinCallMs gates whether an Opus attempt starts; callTimeoutMs is what it gets. A floor
    // above the ceiling would refuse every Opus call on a full budget.
    expect(T.opusMinCallMs).toBeLessThanOrEqual(T.callTimeoutMs);
  });

  it("leaves headroom under the route's maxDuration", () => {
    // /api/get-question declares maxDuration = 300. The budget covers generation only — the banked
    // fallback query, the model-answer kickoff and serialization all come after it.
    expect(T.budgetMs).toBeLessThanOrEqual(200_000);
  });
});

describe("both budgets key on the model, not on whether reasoning was requested", () => {
  // The regression guard proper: each helper takes the model and nothing else, so there is no
  // argument through which the emitter-dependent branch could come back.
  it.each([
    ["generationMaxTokens", generationMaxTokens],
    ["modelAnswerMaxTokens", modelAnswerMaxTokens],
  ])("%s takes only a model id", (_name, fn) => {
    expect(fn.length).toBe(1);
  });
});

describe("no call site hard-codes its own budget", () => {
  const root = process.cwd();

  const MODEL_ANSWER_CALL_SITES = [
    "src/lib/question-engine.ts",
    "src/app/api/generate-model-answer/route.ts",
    "scripts/regen-model-answers.mjs",
    "scripts/remediate-questions.mjs",
  ];

  it.each(MODEL_ANSWER_CALL_SITES)("%s sizes from modelAnswerMaxTokens", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    expect(src, `${rel} no longer references the shared helper`).toContain("modelAnswerMaxTokens");
  });

  it.each(MODEL_ANSWER_CALL_SITES)("%s carries no literal max_tokens: 8000", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    // Comments may still cite 8000 as history; only a live literal is a defect.
    const live = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(live, `${rel} reintroduced a hard-coded model-answer budget`).not.toMatch(
      /max_tokens:\s*8000/
    );
  });

  it("question-engine sizes its generation call from generationMaxTokens", () => {
    const src = readFileSync(join(root, "src/lib/question-engine.ts"), "utf8");
    expect(src).toContain("max_tokens: generationMaxTokens(model)");
  });

  // Same shape of guard, different constant: every model-answer call site must SPLIT the response
  // into its four sections rather than storing the raw text.
  //
  // `extractSection(text, "Model Answer", "Proposed Annotation") || text` is the recurring bug. The
  // `|| text` fires whenever the heading does not match exactly and dumps the whole response — all
  // four sections plus any preamble — into model_answer, leaving proposed_annotation,
  // reasoning_trace and study_diagram_assist NULL. It has now been fixed three times in three files
  // (question-engine.ts, regen-model-answers.mjs, remediate-questions.mjs), each time after it had
  // already written bad rows: most recently 7,785 and 9,462 characters against a ~430-word target,
  // on questions whose own frontmatter reported `actual_word_count: 428`. Raising max_tokens makes
  // the blob bigger, so the two defects compound.
  it.each(MODEL_ANSWER_CALL_SITES)("%s splits the response into sections", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    expect(src, `${rel} no longer uses the shared section parser`).toContain(
      "parseModelAnswerSections"
    );
  });

  it.each(MODEL_ANSWER_CALL_SITES)("%s has no raw-text fallback", (rel) => {
    const live = readFileSync(join(root, rel), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    // The literal defect: an extractSection call salvaged with `|| text`.
    expect(live, `${rel} reintroduced the raw-response fallback`).not.toMatch(
      /extractSection\([^)]*\)\s*\|\|\s*text/
    );
  });
});
