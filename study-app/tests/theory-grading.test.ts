import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  getTheoryRubric,
  listTheoryRubrics,
  theoryQuestionId,
  theoryTimeMinutes,
  theoryWordBand,
  countTheoryWords,
  type TheoryRubric,
} from "@/lib/theory/rubric";
import { buildTheoryEvaluationSystemPrompt, renderRubric } from "@/lib/prompts/theory-evaluation-prompt";
import { THEORY_MARKING_PRINCIPLES } from "@/lib/prompts/theory-marking-principles";
import { AB_TASKS } from "@/lib/model-selector";
import { assertTheoryGradingMeta, extractTheoryGradingMeta } from "@/lib/theory/grading-meta";
import type { TheoryRetrievalResult } from "@/lib/theory/retrieval";

// Theory grading anchors on the examiner-derived rubric, never on a model answer: a theory
// question admits many valid answers with different examples and different positions, so
// scoring by similarity to one exemplar would fail a good essay for choosing differently.
// These tests defend that property and the time budget it is graded against.

const INDEX_PATH = join(process.cwd(), "public", "data", "theory-grading-index.json");

describe("theory grading index", () => {
  it("is built and covers the nine years with a usable examiners' report", () => {
    const rows = JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as TheoryRubric[];
    expect(rows.length).toBe(243);
    const years = [...new Set(rows.map((r) => r.year))].sort();
    // 2015 and 2026 have no published report; 2020 had no exam (COVID).
    expect(years).toEqual([2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025]);
  });

  it("has a known, handled set of questions with no stated pass floor", () => {
    // The examiners sometimes describe what strong answers did without treating anything as
    // required to pass. The extractor honestly records differentiators only; the prompt then
    // has to say so rather than leave the grader with a silently absent floor.
    const empty = listTheoryRubrics().filter((r) => r.coreRequirements.length === 0);
    expect(empty.map((r) => r.id)).toEqual(["th_2025_p4_q3"]);
    const prompt = buildTheoryEvaluationSystemPrompt(empty[0]);
    expect(prompt).toMatch(/Core requirements — NONE STATED/);
    expect(prompt).toMatch(/NOT as a checklist/);
  });

  it("carries a verbatim examiner quote on every requirement and signal", () => {
    for (const r of listTheoryRubrics()) {
      for (const e of [...r.coreRequirements, ...r.differentiators]) {
        expect(e.quote?.trim(), `${r.id} requirement without a quote`).toBeTruthy();
      }
      for (const s of [...r.creditSignals, ...r.penaltySignals]) {
        expect(s.quote?.trim(), `${r.id} signal without a quote`).toBeTruthy();
      }
    }
  });

  it("preserves transcription provenance so transcribed years are never passed off as exact", () => {
    const transcribed = listTheoryRubrics().filter((r) => r.textSource === "transcribed_render");
    // 2021 and 2022 reports were image-only PDFs, transcribed from page renders.
    expect([...new Set(transcribed.map((r) => r.year))].sort()).toEqual([2021, 2022]);
  });
});

describe("id and time helpers", () => {
  it("builds ids in the corpus format", () => {
    expect(theoryQuestionId(2024, 1, 3)).toBe("th_2024_p1_q3");
    expect(getTheoryRubric("th_2024_p1_q3")).not.toBeNull();
  });

  it("gives paper 5 ninety minutes and everything else sixty", () => {
    // From the IMW Student Guide: papers 1/2/4 are 3 hours for 3 answers, paper 3 is 2 hours
    // for 2, and paper 5 is 3 hours for only 2 — so paper 5 alone gets 90 minutes.
    expect([1, 2, 3, 4].map(theoryTimeMinutes)).toEqual([60, 60, 60, 60]);
    expect(theoryTimeMinutes(5)).toBe(90);
  });

  it("scales the word band with the time available", () => {
    expect(theoryWordBand(1)).toEqual({ min: 700, max: 1000 });
    expect(theoryWordBand(5)).toEqual({ min: 1050, max: 1450 });
  });

  it("counts words the same way the offline validator does", () => {
    // Hyphenated compounds count as one word, matching scripts/build_theory_answers.py.
    expect(countTheoryWords("Chablis is well-suited to cool-climate sites.")).toBe(6);
    expect(countTheoryWords("")).toBe(0);
  });
});

describe("theory marking principles", () => {
  it("puts answering the question set above everything else", () => {
    expect(THEORY_MARKING_PRINCIPLES).toMatch(/Answering the question actually set outranks/i);
  });

  it("cites the examiners rather than asserting rules unbacked", () => {
    // Every cardinal rule should carry a year citation; this is the same discipline as the
    // rubric extractor's quote gate applied to the cross-cutting principles.
    const citations = THEORY_MARKING_PRINCIPLES.match(/\(20\d\d[^)]*\)/g) ?? [];
    expect(citations.length).toBeGreaterThan(12);
  });

  it("forbids false precision in the verdict", () => {
    expect(THEORY_MARKING_PRINCIPLES).toMatch(/INDICATIVE band, never a\s*\n?false-precision score/i);
  });
});

describe("prompt construction", () => {
  const rubric = getTheoryRubric("th_2024_p1_q3")!;

  it("renders the rubric with the examiners' own quotes", () => {
    const rendered = renderRubric(rubric);
    expect(rendered).toContain("Core requirements");
    expect(rendered).toContain(rubric.coreRequirements[0].element);
    expect(rendered).toContain(rubric.coreRequirements[0].quote.trim().slice(0, 40));
  });

  it("never instructs the grader to compare against a model answer", () => {
    const prompt = buildTheoryEvaluationSystemPrompt(rubric, { wordCount: 850 });
    // The failure mode this whole system exists to avoid.
    expect(prompt).not.toMatch(/## Model Answer/i);
    expect(prompt).toMatch(/not.*mark the candidate down for\s*\n?choosing different examples/i);
  });

  it("tells the grader the achievable length so it does not penalise good prioritisation", () => {
    const short = buildTheoryEvaluationSystemPrompt(rubric, { wordCount: 400 });
    expect(short).toMatch(/left marks on the table/i);
    const long = buildTheoryEvaluationSystemPrompt(rubric, { wordCount: 1600 });
    expect(long).toMatch(/would not have been finished/i);
    const ok = buildTheoryEvaluationSystemPrompt(rubric, { wordCount: 850 });
    expect(ok).toMatch(/within the achievable range/i);
  });

  it("uses the paper-5 band for a paper-5 question", () => {
    const p5 = listTheoryRubrics().find((r) => r.paper === 5)!;
    const prompt = buildTheoryEvaluationSystemPrompt(p5, { wordCount: 1200 });
    expect(prompt).toMatch(/90 minutes is 1050–1450|1050–1450/);
    expect(prompt).toMatch(/within the achievable range/i);
  });

  it("flags transcribed provenance to the grader", () => {
    const transcribed = listTheoryRubrics().find((r) => r.textSource === "transcribed_render")!;
    expect(buildTheoryEvaluationSystemPrompt(transcribed)).toMatch(/Provenance caveat/i);
    const clean = listTheoryRubrics().find((r) => r.textSource === "pdf_text_layer")!;
    expect(buildTheoryEvaluationSystemPrompt(clean)).not.toMatch(/Provenance caveat/i);
  });

  it("softens the standard where the examiners wrote little", () => {
    const thin = listTheoryRubrics().find((r) => r.evidenceQuality === "thin");
    if (thin) expect(buildTheoryEvaluationSystemPrompt(thin)).toMatch(/Thin evidence/i);
  });

  it("adds dictation handling only for voice input", () => {
    expect(buildTheoryEvaluationSystemPrompt(rubric, { inputMethod: "voice" })).toMatch(/DICTATED/);
    expect(buildTheoryEvaluationSystemPrompt(rubric, { inputMethod: "typed" })).not.toMatch(/DICTATED/);
  });

  it("makes temporal laundering impossible in the written policy", () => {
    const prompt = buildTheoryEvaluationSystemPrompt(rubric);
    expect(prompt).toMatch(/Currency can ADD credit[\s\S]*never EXCUSE/i);
    expect(prompt).toMatch(/Currency credit[\s\S]*evidence or examples drawn from after 2024/i);
    expect(prompt).toMatch(/candidate saying[\s\S]*overtaken by\s*events[\s\S]*does not reclassify/i);
    expect(prompt).toMatch(/preclassified SUPERSEDED/i);
  });

  it("makes retrieval abstention visible and band-neutral", () => {
    const verification: TheoryRetrievalResult = {
      questionId: rubric.id,
      route: "none",
      status: "error",
      reason: "fixture outage",
      query: null,
      checkedAt: "2026-08-06T12:00:00Z",
      dateBucket: "2026-08-06",
      fromCache: false,
      factualChecking: "abstain",
      notice: "Factual retrieval failed. Factual checking abstained; structure was graded normally.",
      passages: [],
      citations: [],
    };
    const prompt = buildTheoryEvaluationSystemPrompt(rubric, { verification });
    expect(prompt).toMatch(/Factual retrieval failed/);
    expect(prompt).toMatch(/band must not move/i);
    expect(prompt).not.toMatch(/## Model Answer/i);
  });

  it("suppresses hindsight credit on an ex-ante question", () => {
    const exAnte = listTheoryRubrics().find((candidate) => candidate.exAnte)!;
    expect(buildTheoryEvaluationSystemPrompt(exAnte)).toMatch(/hindsight is not evidence/i);
    expect(buildTheoryEvaluationSystemPrompt(exAnte)).toMatch(/Suppress all currency credit/i);
  });

  it("extracts and strips machine-readable audit metadata", () => {
    const raw = `# Verdict\nPASS — indicative.\n<!-- THEORY_GRADING_META {"verdict":"PASS","retrievalStatus":"unavailable","factualDecisions":[{"claim":"retrieval","decision":"abstained","sourceUrls":[],"explanation":"No key"}]} -->`;
    const parsed = extractTheoryGradingMeta(raw);
    expect(parsed.meta?.verdict).toBe("PASS");
    expect(parsed.meta?.factualDecisions[0].decision).toBe("abstained");
    expect(parsed.cleanedText).not.toContain("THEORY_GRADING_META");
  });

  it("rejects temporal fact laundering in the machine-readable audit", () => {
    const retrieval: TheoryRetrievalResult = {
      questionId: rubric.id,
      route: "web",
      status: "unavailable",
      reason: "no key",
      query: "fixture",
      checkedAt: "2026-08-06T12:00:00Z",
      dateBucket: "2026-08-06",
      fromCache: false,
      factualChecking: "abstain",
      notice: "No key; abstained.",
      passages: [],
      citations: [],
    };
    expect(() => assertTheoryGradingMeta({
      verdict: "FAIL",
      retrievalStatus: "unavailable",
      factualDecisions: [{
        claim: "candidate claim",
        decision: "refuted",
        sourceUrls: ["https://example.com/not-retrieved"],
        explanation: "memory",
      }],
    }, retrieval)).toThrow(/refutation while retrieval was abstaining/);
  });
});

describe("model selector registration", () => {
  it("exposes theory grading in the admin A/B panel", () => {
    expect(AB_TASKS.map((t) => t.task)).toContain("theory_grading");
  });
});
