import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildProvenance } from "@/lib/wine-bank-lookup";

/**
 * Source URLs name the producer and appellation. Rendering them next to a blind tasting note hands
 * the candidate the answer, so WineReveal only shows them when `showSources` is passed, and the study
 * page must pass it ONLY after the answer is submitted.
 *
 * There is no DOM test runner in this project, so the gate is asserted against the source: the
 * `step === "answer"` block (the one that renders the notes above <AnswerInput>) must not enable it.
 * A static check is worth more than no check for an invariant whose failure mode is silent — the page
 * would look fine and simply be showing the answer away.
 */

const ROOT = join(__dirname, "..");
const studyPage = readFileSync(join(ROOT, "src/app/study/page.tsx"), "utf-8");
const wineReveal = readFileSync(join(ROOT, "src/app/components/WineReveal.tsx"), "utf-8");

/** The JSX for the step whose block renders the answer input — i.e. before submission. */
function preAnswerBlock(): string {
  const start = studyPage.indexOf('{state.step === "answer" && (');
  expect(start, 'the study page should still have a `step === "answer"` block').toBeGreaterThan(-1);
  const end = studyPage.indexOf('{state.step === "feedback" && (', start);
  expect(end, "the answer block should be followed by the feedback block").toBeGreaterThan(start);
  return studyPage.slice(start, end);
}

describe("tasting-note source leak gate", () => {
  it("does not show sources before the candidate has answered", () => {
    const block = preAnswerBlock();
    expect(block).toContain("<WineReveal");
    expect(block).toContain("<AnswerInput"); // proves this really is the pre-submission block
    expect(block).not.toContain("showSources");
    expect(block).not.toContain("provenance=");
  });

  it("does show them after submission", () => {
    // Both post-answer surfaces: the feedback debrief and the reveal-answer view.
    const after = studyPage.slice(studyPage.indexOf('{state.step === "feedback" && ('));
    expect(after.match(/showSources/g)?.length).toBe(2);
  });

  it("defaults to hidden, so a new call site cannot leak by omission", () => {
    expect(wineReveal).toMatch(/showSources\s*=\s*false/);
    expect(wineReveal).toContain("showSources && provenance");
  });

  it("keeps source URLs out of the blind-note prompt entirely", () => {
    const prompt = readFileSync(join(ROOT, "src/lib/prompts/tasting-prompt.ts"), "utf-8");
    // The prompt may discuss sources in prose; what it must never do is interpolate the URL list.
    expect(prompt).not.toContain("tp.sources");
    expect(prompt).not.toContain("sources.join");
  });
});

describe("buildProvenance", () => {
  const src = [{ url: "https://a.test/x.pdf", type: "tech_sheet" as const }];

  it("counts sourced vs inferred fields from the citation map", () => {
    const p = buildProvenance(2, {
      bank_match: null,
      tasting_profile: {
        appearance: "", nose_summary: "", palate_summary: "", structural_summary: "",
        sources: src,
        citations: { color: [0], nose_descriptors: [0], palate_tannin: [], palate_finish: [] },
      },
      confidence: "high",
      source_method: "tavily_research",
      evidence_tier: "tech_sheet",
      enriched_at: "",
    });
    expect(p).toMatchObject({ slot: 2, evidence_tier: "tech_sheet", sourcedFields: 2, totalFields: 4 });
  });

  it("derives a tier for a profile stored before tiers existed", () => {
    const p = buildProvenance(1, {
      bank_match: "x",
      tasting_profile: {
        appearance: "", nose_summary: "", palate_summary: "", structural_summary: "",
        // Legacy shape: bare URL strings, no citations.
        sources: ["https://vinous.com/a"] as unknown as typeof src,
      },
      confidence: "medium",
      source_method: "bank_lookup",
      enriched_at: "",
    });
    expect(p.evidence_tier).toBe("web");
    expect(p.sources).toEqual([{ url: "https://vinous.com/a", type: "web" }]);
    expect(p.totalFields).toBe(0);
  });

  it("survives a wine with no profile at all", () => {
    expect(buildProvenance(3, undefined)).toMatchObject({ slot: 3, sources: [], totalFields: 0 });
  });
});
