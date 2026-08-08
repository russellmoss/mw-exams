// zero-precedent-origin-id.test.ts — a never-seen origin suppresses identification, it doesn't price it.
//
// gen_p1_F2_1786073614804 set a 2-wine same-origin (F2) flight of two curveballs from the Brda–Collio
// amber belt — Slovenia and its Italian twin (Collio, Colli Orientali), which return NOTHING across
// 162 real MW practical papers (2011–2025). The wines are legitimate to pour (every curveball has a
// first appearance), but the stem then put 20 of its 50 marks (40%) on region + variety identification
// no candidate can make from an origin nobody has seen.
//
// The decisive precedent is how the IMW deploys an unprecedented origin: it takes the ID marks off the
// table. 2019 P1 Q3 (Iago's Chinuri, Georgia): "do not spend time thinking about the wine's specific
// origin". 2017 P3 Q2 (Cullen "Amber"): "consider wine 4 to be of unknown origin". So an ID ask over
// an all-zero-precedent flight is the defect at ANY mark level; the marks belong on style, winemaking,
// quality and commercial.
import { describe, it, expect } from "vitest";
import { idMarkAllocationViolations, type AuditWine } from "../src/lib/question-validator";

const q = (questionText: string, wines: AuditWine[], totalMarks?: number) => ({
  questionId: "test",
  paper: 1,
  family: "F2",
  questionText,
  totalMarks,
  wines,
});
const hard = <T extends { severity: string }>(v: T[]) => v.filter((x) => x.severity === "hard");

// The flight the feedback binned: both wines from the Brda–Collio amber belt.
const BRDA_PAIR: AuditWine[] = [
  { slot: 1, varieties: ["Ribolla Gialla"], region: "Brda", country: "Slovenia" },
  { slot: 2, varieties: ["Friulano"], region: "Brda", country: "Slovenia" },
];

// A well-precedented same-origin pair — the rule must NOT touch these.
const RIOJA_PAIR: AuditWine[] = [
  { slot: 1, varieties: ["Tempranillo"], region: "Rioja", country: "Spain" },
  { slot: 2, varieties: ["Garnacha"], region: "Rioja", country: "Spain" },
];

const STEM =
  `Wines 5 and 6 come from the same region of origin and are made from different grape varieties.\n` +
  `a) Identify the region of origin as closely as possible. (10 marks)\n` +
  `b) Identify the grape variety. (2 x 5 marks)\n` +
  `c) Comment on the style, winemaking, and quality. (2 x 10 marks)\n` +
  `d) Discuss the commercial position and ageing potential. (2 x 5 marks)`;

describe("identification over a zero-precedent origin", () => {
  it("hard-rejects the binned Brda/Collio ID ask, naming the origin", () => {
    const v = idMarkAllocationViolations(q(STEM, BRDA_PAIR, 50));
    const zp = hard(v).filter((x) => x.rule === "zero-precedent-origin-id");
    expect(zp).toHaveLength(1);
    expect(/Brda|Collio|Slovenia/.test(zp[0].detail)).toBe(true);
  });

  it("fires even when the mark share and part sizes are otherwise within the real exam's range", () => {
    // 20 of 50 (40%) is the real exam's MEDIAN ID share, and 10 is its median single-part value, so the
    // share/part-size arms stay silent — the zero-precedent origin is the whole defect.
    const v = idMarkAllocationViolations(q(STEM, BRDA_PAIR, 50));
    expect(hard(v).some((x) => x.rule === "zero-precedent-origin-id")).toBe(true);
    expect(hard(v).some((x) => x.rule === "id-mark-allocation")).toBe(false);
  });

  it("leaves a well-precedented same-origin pair alone", () => {
    const v = idMarkAllocationViolations(q(STEM, RIOJA_PAIR, 50));
    expect(v.some((x) => x.rule === "zero-precedent-origin-id")).toBe(false);
  });

  it("does not fire when only ONE wine is from the never-seen origin (there is still a route)", () => {
    const mixed = [RIOJA_PAIR[0], BRDA_PAIR[0]];
    const v = idMarkAllocationViolations(q(STEM, mixed, 50));
    expect(v.some((x) => x.rule === "zero-precedent-origin-id")).toBe(false);
  });

  it("says nothing when the flight asks for no identification at all", () => {
    const noId =
      `Wines 5 and 6 come from the same region of origin.\n` +
      `a) Comment on the style, winemaking, and quality. (2 x 15 marks)\n` +
      `b) Discuss the commercial position and ageing potential. (2 x 10 marks)`;
    expect(idMarkAllocationViolations(q(noId, BRDA_PAIR, 50))).toEqual([]);
  });
});
