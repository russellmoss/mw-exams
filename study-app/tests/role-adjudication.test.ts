import { describe, it, expect } from "vitest";
import {
  corpusEvidenceFor,
  parseRoleRulings,
  renderCorpusEvidence,
  roleDisputeBlock,
  roleAdjudicationRules,
  type RoleDisputeForPrompt,
} from "@/lib/prompts/role-adjudication";
import { composeReviewFeedback } from "@/lib/question-review";
import { sanitizeRoleOverrides } from "@/lib/question-review-shared";

const dispute = (over: Partial<RoleDisputeForPrompt> = {}): RoleDisputeForPrompt => ({
  id: 1,
  questionId: "gen_p1_F1_1",
  slot: 2,
  reviewerName: "Mike Juergens",
  wineLabel: "Bodega X Malbec, Uco Valley 2019",
  variety: "Malbec",
  region: "Mendoza",
  country: "Argentina",
  keyedRole: "curveball",
  claimedRole: "banker",
  ...over,
});

describe("role overrides — capture", () => {
  it("drops a no-op override rather than filing a claim nobody made", () => {
    // A no-op would create a wine_role_rulings row, cost an adjudication, and pollute the
    // calibration evidence with an assertion the reviewer never intended.
    expect(sanitizeRoleOverrides([{ slot: 1, keyed: "banker", reviewer: "banker" }])).toBeNull();
  });

  it("keeps one entry per slot and sorts them", () => {
    const out = sanitizeRoleOverrides([
      { slot: 3, keyed: "banker", reviewer: "curveball" },
      { slot: 1, keyed: "curveball", reviewer: "banker" },
      { slot: 3, keyed: "banker", reviewer: "curveball" },
    ]);
    expect(out).toEqual([
      { slot: 1, keyed: "curveball", reviewer: "banker" },
      { slot: 3, keyed: "banker", reviewer: "curveball" },
    ]);
  });

  it("rejects malformed entries without throwing", () => {
    expect(sanitizeRoleOverrides("nope")).toBeNull();
    expect(sanitizeRoleOverrides([{ slot: 0, keyed: "banker", reviewer: "curveball" }])).toBeNull();
    expect(sanitizeRoleOverrides([{ slot: 1, keyed: "anchor", reviewer: "curveball" }])).toBeNull();
  });

  it("states the dispute as an itemised claim in the feedback text", () => {
    const text = composeReviewFeedback({
      reviewerName: "Mike Juergens",
      tags: ["bad_wine_choice"],
      note: "This flight has no anchor.",
      roleOverrides: [{ slot: 2, keyed: "banker", reviewer: "curveball" }],
      wines: [{ slot: 2, label: "Somló Furmint 2018" }],
    });
    expect(text).toContain("ROLE DISPUTE");
    expect(text).toContain("Wine 2 (Somló Furmint 2018)");
    expect(text).toContain("BANKER");
    expect(text).toContain("CURVEBALL");
    // The written reason still survives alongside it.
    expect(text).toContain("This flight has no anchor.");
  });
});

describe("corpus counter-evidence", () => {
  it("finds real exam precedent for a classic region and reports the basis", () => {
    const e = corpusEvidenceFor({ region: "Alsace", country: "France", variety: "Riesling" });
    expect(e.matched).toBeGreaterThan(0);
    expect(e.basis).toBe("region");
    expect(e.examples.length).toBeGreaterThan(0);
  });

  it("reports NO PRECEDENT as evidence against a banker claim, not as silence", () => {
    const e = corpusEvidenceFor({ region: "Ycoden-Daute-Isora", country: "Narnia", variety: "Listán" });
    expect(e.matched).toBe(0);
    const rendered = renderCorpusEvidence(e);
    expect(rendered).toContain("NO PRECEDENT");
    expect(rendered).toContain("AGAINST calling it a banker");
    // …and explicitly does NOT read as "therefore unusable", which would be the wrong inference.
    expect(rendered).toContain("NOT, by itself, evidence that the wine is unsuitable as a curveball");
  });

  it("labels a country-only match as weak so it is not read as a verdict", () => {
    const e = corpusEvidenceFor({ region: null, country: "France", variety: null });
    if (e.matched > 0) {
      expect(e.basis).toBe("country");
      expect(renderCorpusEvidence(e)).toContain("weak");
    }
  });
});

describe("the adjudication contract", () => {
  it("tells the model its default is the calibration, not the reviewer", () => {
    const rules = roleAdjudicationRules();
    expect(rules).toContain("DEFAULT IS TO UPHOLD THE EXISTING CALIBRATION, NOT THE REVIEWER");
    expect(rules).toContain("OVERRULE is an expected");
    // The reachability test, which is the whole basis of the banker concept.
    expect(rules).toContain("REACHABILITY, NOT FAME");
  });

  it("renders nothing at all when there are no disputes", () => {
    expect(roleDisputeBlock([])).toBe("");
  });

  it("renders the calibration, the exclusions and each claim's own evidence", () => {
    const block = roleDisputeBlock([dispute(), dispute({ id: 2, slot: 4 })]);
    expect(block).toContain("id=1");
    expect(block).toContain("id=2");
    expect(block).toContain("Deliberately NOT counted as bankers");
    // The Mendoza exclusion's cited reason must be in front of the model when it rules on a Mendoza
    // claim — that exclusion exists precisely because this argument was had before.
    expect(block).toContain("EK-0029");
  });
});

describe("parsing the verdict lines", () => {
  it("parses a well-formed line", () => {
    const parsed = parseRoleRulings(
      "RoleRuling: id=7 verdict=upheld edit=narrow_signal signal=fr-alsace-noble — Sylvaner is not a noble grape."
    );
    expect(parsed).toEqual([
      {
        id: 7,
        verdict: "upheld",
        edit: "narrow_signal",
        signal: "fr-alsace-noble",
        rationale: "Sylvaner is not a noble grape.",
      },
    ]);
  });

  it("parses signal=none as no target", () => {
    const parsed = parseRoleRulings(
      "RoleRuling: id=3 verdict=overruled edit=none signal=none - The corpus shows Mendoza used as a comparative peer, never an anchor."
    );
    expect(parsed[0].signal).toBeNull();
    expect(parsed[0].verdict).toBe("overruled");
  });

  /**
   * The load-bearing one. A response that ARGUES a claim is weak and then fails to emit its line must
   * leave the ruling pending — never be read as a verdict from the prose. Inferring one would let a
   * paragraph explaining why a reviewer is wrong be recorded as an upheld ruling that edits the
   * calibration every future flight is built against.
   */
  it("drops anything that does not parse rather than inferring a verdict", () => {
    expect(
      parseRoleRulings(
        "I think this claim is upheld, honestly — the wine is clearly a banker and we should add a signal."
      )
    ).toEqual([]);
    expect(parseRoleRulings("RoleRuling: id=4 verdict=maybe edit=none signal=none - unsure")).toEqual([]);
    expect(parseRoleRulings("RoleRuling: id=4 verdict=upheld edit=rewrite_everything signal=x - no")).toEqual([]);
  });

  it("takes the first line for an id, so a stray restatement cannot override the verdict", () => {
    const parsed = parseRoleRulings(
      [
        "RoleRuling: id=9 verdict=overruled edit=none signal=none - Generalising from one bottle.",
        "…for example one might write RoleRuling: id=9 verdict=upheld edit=add_signal signal=x - example only.",
      ].join("\n")
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].verdict).toBe("overruled");
  });

  it("handles several claims in one response", () => {
    const parsed = parseRoleRulings(
      [
        "prose about the first claim…",
        "RoleRuling: id=1 verdict=upheld edit=add_exclusion signal=none - No corpus precedent as an anchor.",
        "RoleRuling: id=2 verdict=inconclusive edit=none signal=none - Evidence does not settle it.",
      ].join("\n")
    );
    expect(parsed.map((p) => p.id)).toEqual([1, 2]);
    expect(parsed[1].verdict).toBe("inconclusive");
  });
});
