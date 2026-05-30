// question-validator.ts — hard validity checks for generated MW questions (Phase A/B).
// Pure, no I/O. Shared by the corpus audit (audit-questions.mjs) and the generation gate.
// A "hard" violation means the stem contradicts its own wines/answer key, so the question is
// unanswerable as framed and must NOT be served. "soft" = worth flagging, not disqualifying.

export interface AuditWine {
  slot: number;
  varieties: string[];
  region: string;
  country?: string;
  is_blend?: boolean;
  style?: string;
}
export interface QuestionForAudit {
  questionId: string;
  paper: number;
  family: string;
  questionText: string;
  totalMarks?: number;
  wines: AuditWine[];
}
export interface Violation {
  rule: string;
  severity: "hard" | "soft";
  detail: string;
}

// How the Stem Sniper drill should score a flight's origin predictions.
//   "per-wine" — score each wine's predicted origin individually (correct/incorrect per wine).
//   "set"      — score the predicted *pool* of origins (did the candidate name the right set?),
//                because the stem gives no clue which origin maps to which wine number.
export type StemSniperScoringModel = "per-wine" | "set";

const NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// Canonicalise so synonyms don't read as different grapes (the "same variety" check).
const VARIETY_SYNONYMS: Record<string, string> = {
  shiraz: "syrah", spatburgunder: "pinot noir", "pinot nero": "pinot noir",
  grauburgunder: "pinot gris", weissburgunder: "pinot blanc", alvarinho: "albarino",
  garnacha: "grenache", carinena: "carignan", mazuelo: "carignan", mataro: "mourvedre",
  "tinta de toro": "tempranillo", "tinto fino": "tempranillo", spanna: "nebbiolo", primitivo: "zinfandel",
  "tocai friulano": "friulano",
};
const norm = (s?: string) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const canonVariety = (s?: string) => {
  const n = norm(s);
  return VARIETY_SYNONYMS[n] || n;
};

// Normalise a stem the same way validateQuestion does (lower-case, accents stripped, punctuation
// flattened so "same, single grape variety" reads as "same single grape variety").
const normStem = (questionText?: string) =>
  norm(questionText).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Stem Sniper scoring model for a flight.
//
// In a "same (single) grape variety" flight the variety is ONE shared answer, but the origins
// differ per wine and the stem gives no clue which origin maps to which wine number. From the stem
// alone a candidate can only identify the likely *pool* of origins (e.g. {Northern Rhône, Barossa,
// Stellenbosch, …} for a Syrah/Shiraz flight) — the exact wine-number assignment is irreducibly
// ambiguous without the wine in the glass. The MW exam rewards this pool/funnel reasoning, not the
// per-wine mapping: "More marks can be given when the conclusion is wrong, as we can then see and
// reward intelligent thinking" (2019 Examiner Report). So such flights must be scored as a SET
// (variety + origin pool, with optional per-wine-assignment bonus), not per-wine binary. Every
// other flight keeps the existing per-wine scoring.
export function stemSniperScoringModel(questionText?: string, wineCount = 0): StemSniperScoringModel {
  const stem = normStem(questionText);
  const sameVariety = /\bsame (?:single )?grape variety\b|\bsame variety\b/.test(stem);
  return sameVariety && wineCount >= 2 ? "set" : "per-wine";
}

export function validateQuestion(q: QuestionForAudit): {
  ok: boolean;
  violations: Violation[];
  scoringModel: StemSniperScoringModel;
} {
  const v: Violation[] = [];
  // Strip punctuation for phrase matching so "same, single grape variety" reads as "same single
  // grape variety" (a real comma-bug seen in the corpus).
  const stem = normStem(q.questionText);
  const wines = q.wines || [];
  const primaries = wines.map((w) => canonVariety(w.varieties?.[0]));
  const distinctPrimary = new Set(primaries.filter(Boolean));
  const distinctCountry = new Set(wines.map((w) => norm(w.country)).filter(Boolean));
  const predominantly = /\bpredominantly\b/.test(stem); // explicitly permits blends / dominant grape

  // The flight is described in subsets/pairs ("Wines 1 and 2 … Wine 3 is …", "two wines … the
  // other two"). Per-subset claims can't be validated flight-wide without false positives, so we
  // skip the flight-wide checks for these. (A plain "Wines 1 to N …" / "each wine" is flight-wide.)
  const subsetSplit =
    /the other (?:two|three|one|wine)\b|\btwo wines\b|\bwines?\s+1\s+and\s+2\b|\bwines?\s+3\s+and\s+4\b|\bwine\s+[1-9]\s+(?:is|are|comes)\b/.test(stem);

  if (!subsetSplit) {
    // R1 — country diversity. "N different countries" needs N distinct; bare "different countries"
    // needs one per wine. (Catches the "four different countries" stem with two USA wines.)
    const cc = stem.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s+(?:different\s+)?countries\b/);
    const bareDiff = /\bdifferent\s+countries\b/.test(stem);
    if (cc || bareDiff) {
      const required = cc ? (/^\d+$/.test(cc[1]) ? Number(cc[1]) : NUM[cc[1]]) : wines.length;
      if (required && distinctCountry.size < required)
        v.push({
          rule: "country-diversity",
          severity: "hard",
          detail: `stem implies ${required} different countries; key has only ${distinctCountry.size} distinct (${[...distinctCountry].join(", ") || "none"})`,
        });
    }

    // R2 — "same (single) grape variety" ⇒ one dominant variety across the flight.
    if (/\bsame (?:single )?grape variety\b|\bsame variety\b/.test(stem) && distinctPrimary.size > 1)
      v.push({
        rule: "same-variety",
        severity: "hard",
        detail: `stem says same variety; key has ${distinctPrimary.size}: ${[...distinctPrimary].join(", ")}`,
      });

    // R3 — "different grape varieties" ⇒ every dominant variety distinct.
    if (/different (?:single )?grape variet(?:y|ies)/.test(stem)) {
      const present = primaries.filter(Boolean);
      if (present.length !== distinctPrimary.size)
        v.push({
          rule: "distinct-variety",
          severity: "hard",
          detail: `stem says different varieties; duplicates present (${primaries.join(", ")})`,
        });
    }

    // R4 — "same country" ⇒ one country.
    if (/\bsame country\b/.test(stem) && distinctCountry.size > 1)
      v.push({
        rule: "same-country",
        severity: "hard",
        detail: `stem says same country; key has ${[...distinctCountry].join(", ")}`,
      });
  }

  // R5 — "single grape variety" + a blend wine. SOFT: a dominant-grape blend / co-ferment (Côte-Rôtie
  // Syrah-Viognier, Tawny Port) is often legitimate, and "predominantly" explicitly permits it. Truly
  // wrong wines in a same-variety flight are caught (hard) by R2.
  if (!predominantly && /\bsingle grape variety\b/.test(stem) && wines.some((w) => w.is_blend))
    v.push({
      rule: "single-variety-blend",
      severity: "soft",
      detail: `stem says single grape variety; a wine is a blend (${wines.filter((w) => w.is_blend).map((w) => w.varieties.join("/")).join("; ")})`,
    });

  // R6 — marks: 25 per wine (universal in the MW corpus). Soft.
  if (q.totalMarks && wines.length && q.totalMarks !== wines.length * 25)
    v.push({ rule: "marks", severity: "soft", detail: `total_marks ${q.totalMarks} != ${wines.length}×25` });

  return {
    ok: !v.some((x) => x.severity === "hard"),
    violations: v,
    scoringModel: stemSniperScoringModel(q.questionText, wines.length),
  };
}
