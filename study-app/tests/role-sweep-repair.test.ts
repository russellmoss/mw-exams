import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  flightCompositionViolations,
  isBanker,
  validateQuestion,
  type AuditWine,
} from "@/lib/question-validator";
import { classifyWineStyle } from "@/lib/p3-category.mjs";
import { buildCodifyBrief, findConflicts } from "@/lib/role-ruling-codify";
import { MAX_REPAIR_BATCH, MAX_REPAIRS_PER_QUESTION } from "@/lib/wine-swap";
import type { RoleRuling } from "@/lib/wine-role-rulings";

function wine(slot: number, varieties: string[], region: string, country: string): AuditWine {
  return {
    slot,
    varieties,
    region,
    country,
    fullText: `Producer ${slot}, cuvée. ${region}, ${country}.`,
  } as AuditWine;
}

const ruling = (over: Partial<RoleRuling> = {}): RoleRuling => ({
  id: 11,
  questionId: "gen_p1_F1_1",
  slot: 3,
  reviewerId: 1,
  reviewerName: "Mike Juergens",
  wineLabel: "Somló Furmint 2018",
  variety: "Furmint",
  region: "Somló",
  country: "Hungary",
  keyedRole: "banker",
  claimedRole: "curveball",
  verdict: "upheld",
  rationale: "Somló is not Tokaj; the region has no corpus precedent as an anchor.",
  proposedEdit: "narrow_signal",
  targetSignal: "hu-tokaj",
  prUrl: null,
  codifiedAt: null,
  createdAt: new Date(0).toISOString(),
  ...over,
});

/**
 * The sweep's whole premise: a calibration change flips banked questions from passing to failing.
 * These pin the before/after shape of that flip on a flight built from the real table, so a future
 * refactor of isBanker cannot quietly stop the sweep having anything to find.
 */
describe("what the sweep is looking for", () => {
  it("a flight loses its bankers when those wines are reclassified", () => {
    const withBankers = [
      wine(1, ["chardonnay"], "Chablis", "France"),
      wine(2, ["riesling"], "Mosel", "Germany"),
      wine(3, ["savagnin"], "Jura", "France"),
    ];
    expect(flightCompositionViolations(withBankers)).toEqual([]);

    // Swap the anchors for reviewer-calibrated curveballs: now nothing anchors the flight.
    const bankerless = [
      wine(1, ["xinomavro"], "Naoussa", "Greece"),
      wine(2, ["assyrtiko"], "Santorini", "Greece"),
      wine(3, ["savagnin"], "Jura", "France"),
    ];
    // An all-curveball trio trips BOTH arms — no banker, and 3 curveballs against a budget of 1.
    const v = flightCompositionViolations(bankerless);
    expect(v.map((x) => x.severity)).toEqual(["hard", "hard"]);
    expect(v.every((x) => x.rule === "flight-composition")).toBe(true);
    expect(v[0].detail).toContain("no banker");
    expect(v[1].detail).toContain("at most 1");
    // The messages name the wines, which is what makes the repair queue actionable rather than a
    // list of question ids to take on trust.
    expect(v[0].detail).toContain("wine 1");
  });

  it("the curveball budget scales with the flight, so a big P3 flight is not held to a small one's", () => {
    const six = [
      wine(1, ["chardonnay"], "Chablis", "France"),
      wine(2, ["riesling"], "Mosel", "Germany"),
      wine(3, ["assyrtiko"], "Santorini", "Greece"),
      wine(4, ["savagnin"], "Jura", "France"),
      wine(5, ["xinomavro"], "Naoussa", "Greece"),
      wine(6, ["furmint"], "Somló", "Hungary"),
    ];
    // 4 curveballs against a budget of max(2, ceil(6/2)) = 3.
    expect(flightCompositionViolations(six)).toHaveLength(1);
    expect(isBanker(six[0])).toBe(true);
  });
});

/**
 * Two regressions caught only by running the sweep against the real bank on a Neon branch. Both were
 * silent: the code ran, reported success, and did the wrong thing.
 */
describe("regressions from the end-to-end run", () => {
  /**
   * THE SEVERITY FILTER. validateQuestion deliberately downgrades flight-composition to SOFT in the
   * audit path (the "POOL-ADMISSION ASYMMETRY" note): the rule rejects ~5% of real IMW flights, so
   * retiring banked questions on it is the wrong trade.
   *
   * The first sweep filtered on `severity === "hard"` and therefore reported ZERO hits across 333
   * servable questions while the most common role fault — the one the reviewers actually raise — was
   * sitting right there. This pins the severity so a future change to it cannot re-blind the sweep
   * without failing here.
   */
  it("flight-composition is SOFT from validateQuestion, so a sweep must not filter on hard", () => {
    const bankerless = [
      wine(1, ["xinomavro"], "Naoussa", "Greece"),
      wine(2, ["assyrtiko"], "Santorini", "Greece"),
      wine(3, ["savagnin"], "Jura", "France"),
    ];
    // Emitted HARD by the rule itself — which is what the generation path consumes.
    expect(flightCompositionViolations(bankerless).every((v) => v.severity === "hard")).toBe(true);

    // …and SOFT once it comes through the audit entry point.
    const res = validateQuestion({
      questionId: "t", paper: 1, family: "F1",
      questionText: "Wines 1 to 3 are dry white wines. Identify each. (3 x 25 marks)",
      totalMarks: 75, wines: bankerless,
    });
    const fc = res.violations.filter((v) => v.rule === "flight-composition");
    expect(fc.length).toBeGreaterThan(0);
    expect(fc.every((v) => v.severity === "soft")).toBe(true);
  });

  /**
   * THE STYLE GATE. classifyWineStyle returns an OBJECT, not a string. The replacement picker compared
   * two of them with !==, which compares identities, is always true, and rejected every candidate in
   * the bank — after an earlier version with no style gate at all had offered a Barolo into a dry-white
   * flight and a sparkling Brut Rosé into a still Pinot Noir flight.
   */
  it("classifyWineStyle returns an object — comparing two with !== is always true", () => {
    const a = classifyWineStyle("Bodegas Roda, Roda Reserva. Rioja, Spain.");
    const b = classifyWineStyle("Bodegas Roda, Roda Reserva. Rioja, Spain.");
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // …which is exactly why the identity comparison filtered everything out
    expect(a).toHaveProperty("style");
    expect(a).toHaveProperty("isRose");
  });

  it("separates the styles the picker must not swap across", () => {
    const still = classifyWineStyle("Bodegas Roda, Roda Reserva. Rioja, Spain.");
    const sparkling = classifyWineStyle("Domaine Chandon, Green Point Blanc de Blancs. Yarra Valley, Australia.");
    const oxidative = classifyWineStyle("Domaine de Montbourgeau, L'Etoile. Jura, France.");
    expect(sparkling.style).toBe("sparkling");
    expect(oxidative.style).toBe("oxidative");
    // Still and oxidative are BOTH legal inside a Paper 1 flight — a stem saying the wines were "made
    // using a range of different winemaking approaches" is asking for exactly that contrast, so the
    // picker must not demand exact style identity outside Paper 3.
    const STILL = new Set(["other", "oxidative"]);
    expect(STILL.has(still.style)).toBe(true);
    expect(STILL.has(oxidative.style)).toBe(true);
    expect(STILL.has(sparkling.style)).toBe(false);
  });
});

describe("codification brief", () => {
  it("names the exact edit, the target entry and the source stamp", () => {
    const { context, analysisText } = buildCodifyBrief([ruling()]);
    expect(context).toContain("Ruling 11 — narrow_signal");
    expect(context).toContain("Somló Furmint 2018");
    // The stamp is what links a line of wine knowledge back to the expert who asserted it.
    expect(context).toContain('"source": "ruling:11"');
    // The current state of the entry being amended, so the agent is not guessing at what it looks like.
    expect(context).toContain("Current entry `hu-tokaj`");
    expect(analysisText).toContain("data/banker_signals.json");
    expect(analysisText).toContain("Kind: validator");
  });

  it("tells the agent not to touch the removed in-code table", () => {
    // The single most likely wrong turn: BANKER_SIGNALS no longer exists, and an agent working from
    // stale knowledge of this repo would go looking for it in question-validator.ts.
    const { analysisText } = buildCodifyBrief([ruling()]);
    expect(analysisText).toContain("Do not touch `BANKER_SIGNALS`");
  });

  it("demands a test, and refuses the loosen-the-assertion escape hatch", () => {
    const { analysisText } = buildCodifyBrief([ruling()]);
    expect(analysisText).toContain("banker-signals.test.ts");
    expect(analysisText).toContain("Do not");
    expect(analysisText).toContain("loosen an assertion to make a build pass");
  });

  it("flags two rulings pulling the same signal in opposite directions", () => {
    const conflicts = findConflicts([
      ruling({ id: 1, claimedRole: "curveball", targetSignal: "fr-alsace-noble" }),
      ruling({ id: 2, claimedRole: "banker", targetSignal: "fr-alsace-noble" }),
    ]);
    expect(conflicts).toEqual([{ signal: "fr-alsace-noble", rulingIds: [1, 2] }]);
  });

  it("does not flag two rulings refining the same signal in the same direction", () => {
    expect(
      findConflicts([
        ruling({ id: 1, claimedRole: "curveball", targetSignal: "fr-alsace-noble" }),
        ruling({ id: 2, claimedRole: "curveball", targetSignal: "fr-alsace-noble" }),
      ])
    ).toEqual([]);
  });

  it("surfaces a conflict in the brief itself, not only in the UI", () => {
    const { context } = buildCodifyBrief([
      ruling({ id: 1, claimedRole: "curveball", targetSignal: "fr-alsace-noble" }),
      ruling({ id: 2, claimedRole: "banker", targetSignal: "fr-alsace-noble" }),
    ]);
    expect(context).toContain("CONFLICTS — READ BEFORE MERGING");
  });

  it("says so when the adjudicator named a signal that does not exist", () => {
    const { context } = buildCodifyBrief([ruling({ targetSignal: "not-a-real-signal" })]);
    expect(context).toContain("DOES NOT EXIST");
  });
});

/**
 * A repair that ends without closing its question_repairs row leaves it at 'queued', so the next batch
 * picks it up and pays for the same generation again — indefinitely, when the cause is a surviving
 * wine the swap never touches. That is exactly what happened on the branch run: repair 23 failed on a
 * colour-resolution error, reported the failure to the caller, and stayed queued.
 *
 * A behavioural test would need a database and a generation call. This scans the source instead — the
 * same approach tests/client-server-boundary.test.ts takes — and asserts the cheap structural property
 * that actually failed: every `return { ...base` in repairQuestion is preceded by a closeRow call.
 */
describe("every repair outcome closes its ledger row", () => {
  it("no early return in repairQuestion escapes without closeRow", () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "wine-swap.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function repairQuestion"));
    const end = body.indexOf("\nexport async function runRepairBatch");
    const fn = end > 0 ? body.slice(0, end) : body;

    const lines = fn.split(/\r?\n/);
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      if (!/return\s*\{\s*\.\.\.base/.test(line)) return;
      // The success path returns `status: "applied"` and closes the row through its own branch.
      if (/status:\s*"applied"/.test(line)) return;
      const preceding = lines.slice(Math.max(0, i - 12), i).join("\n");
      if (!/closeRow\(/.test(preceding)) offenders.push(`line ${i + 1}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it("closeRow writes a terminal status, never leaves it queued", () => {
    const src = readFileSync(join(__dirname, "..", "src", "lib", "wine-swap.ts"), "utf8");
    expect(src).toMatch(/closeRow\s*=\s*async\s*\(\s*status:\s*"failed"\s*\|\s*"skipped"/);
  });
});

describe("the bounds on repair", () => {
  it("caps a batch and caps repeat repairs on one question", () => {
    // Both are spending limits with a stated rationale, and both are the kind of constant that gets
    // quietly raised. Pinning them makes that a deliberate, reviewed change.
    expect(MAX_REPAIR_BATCH).toBe(10);
    expect(MAX_REPAIRS_PER_QUESTION).toBe(2);
  });
});
