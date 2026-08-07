// wine-reference-shape.test.ts — a wine slot must hold a wine, not the generator's reasoning.
//
// Seven banked questions (12 slots) reached the bank with the model's deliberation stored as a wine's
// fullText: "Chambers Rosewood — wait, excluded. Let me correct.", a 601-character paragraph weighing
// up which Amontillado to use, a bare "...", the P3 STILL_DRY sub-rule quoted back at itself, and
// truncated fragments ("The Sadie Family Wines, Pof"). Nothing downstream noticed. Wine enrichment ran
// a Tavily search on the paragraph, the wine_bank gained rows whose "producer" was a sentence of
// deliberation, and the flight was served to the candidate as a real question.
//
// The rule that stops it is a shape assertion on the label. The cases below are the REAL strings from
// generated_questions.wines (junk) and a spread of real ones across the corpus's formats (good), so a
// future loosening of the rule has to survive the actual data.
import { describe, it, expect } from "vitest";
import { checkWineReferenceShape, applyQuestionRules, winesFromText } from "../src/lib/question-rules.mjs";
import { validateWineReferenceShape } from "../src/lib/question-engine";
import { validateQuestion } from "../src/lib/question-validator";

// Verbatim from the bank, one per failure mode.
const JUNK: [string, string][] = [
  ["a bare ellipsis", "..."],
  ["a truncated producer", "Zind-Humbrecht..."],
  ["a country with a tick", "South Africa ✓"],
  ["a style note with a tick", "Torcolato (dried-grape sweet wine) ✓"],
  ["mid-sentence truncation", "The Sadie Family Wines, Pof"],
  ["truncated region", "Losada Vinos de Finca, Losada Mencía, 2022. Bierz"],
  ["a correction note", "Chambers Rosewood — wait, excluded. Let me correct."],
  ["a dedup note", "Dönnhoff, Schlossgut Diel — wait, Dönnhoff is on the deduplication list."],
  ["an applied-correction marker", "Weingut Dr. Loosen, Erdener Treppchen Riesling — CORRECTION APPLIED — see reasoning."],
  [
    "a substitution note",
    "Stanton & Killeen has been excluded — replacing: Yalumba Museum Reserve Muscat NV. Rutherglen, Victoria, Australia. (18%)",
  ],
  [
    "reasoning followed by a well-formed wine",
    "Domaine Weinbach — no, excluded. Chateau Ste. Michelle Eroica Riesling — no, excluded. Weingut Wittmann Westhofener Riesling Grosses Gewächs 2022. Rheinhessen, Germany. (13.0%)",
  ],
  [
    "the prompt's own rules quoted back",
    "The P3 STILL_DRY sub-rule requires that a still dry white is only in scope for Paper 3 if it is paired with a fortified or flor-driven wine — or if it is itself flor/sous voile-driven. A Sauternes Blanc Sec is a conventionally made dry white — it belongs in Paper 1.",
  ],
  [
    "a paragraph of deliberation",
    "**Spain** — Amontillado Sherry (Palomino, oxidative/fortified) — classic identifier, mid-tier commercial. Barbadillo Príncipe Amontillado VORS — non-banned ✓. But VORS is still quite special. Barbadillo Príncipe Medium Amontillado? Or Barbadillo Manzanilla Solear?",
  ],
];

// Real labels from the bank, chosen to span the formats that actually occur: accents, ABV with and
// without a decimal, "ABV" spelled out, NV instead of a vintage, three- and four-part origins, and the
// two rows whose origin ends on a hyphenated region rather than a bare country name.
const GOOD = [
  "Domaine Weinbach Cuvée Ste Catherine Riesling, 2021. Alsace, France. (13%)",
  "Domaine du Closel Les Clos 2018. Savennières, Loire Valley, France. (14.5% ABV)",
  "Chandon Argentina Blanc de Blancs Brut NV. Mendoza, Argentina. (12%)",
  "Torbreck RunRig 2018. Barossa Valley, South Australia, Australia. (15.5%)",
  "Clos du Val, Cabernet Sauvignon, 2019. Napa Valley, California, USA. (14.5%)",
  "Joh. Jos. Christoffel Erben Ürziger Würzgarten Riesling Auslese 2019. Mosel, Germany. (8.0%)",
  "Donáth Pince, Furmint Öreg Tőkék, 2022. Tokaj, Hungary. (13.0%)",
  "Bodegas Hidalgo La Gitana Pasada NV. Jerez, Spain. (19.0% ABV)",
  "Samos Union of Winemaking Cooperatives, Samos Muscat Grand Cru, 2021. Samos PDO, Aegean Islands, Greece. (15%)",
  "Domaine de la Pepiere, Muscadet Sevre et Maine sur Lie Clos des Briords, 2021. Loire Valley, France. (12.0%)",
];

describe("checkWineReferenceShape", () => {
  it.each(JUNK)("rejects %s", (_label, text) => {
    const res = checkWineReferenceShape(text);
    expect(res.ok, `should have been rejected: ${text.slice(0, 60)}`).toBe(false);
    expect(res.problem).toBeTruthy();
  });

  it.each(GOOD)("accepts %s", (text) => {
    expect(checkWineReferenceShape(text), `false positive on a real label`).toMatchObject({ ok: true });
  });

  it("accepts an origin outside the country list used for diversity detection", () => {
    // detectCountryName's list is order-sensitive and deliberately narrow; the shape anchor is a
    // superset so a legitimate curveball origin is never mistaken for truncated junk.
    expect(checkWineReferenceShape("Château Bela, Riesling, 2021. Muzla, Slovakia. (12.5%)").ok).toBe(true);
    expect(checkWineReferenceShape("Sula Vineyards, Dindori Reserve Shiraz, 2022. Nashik, India. (14%)").ok).toBe(true);
  });
});

describe("the rule fires through both stages", () => {
  const wines = [
    { slot: 1, fullText: "Domaine Weinbach Cuvée Ste Catherine Riesling, 2021. Alsace, France. (13%)" },
    { slot: 2, fullText: "Chambers Rosewood — wait, excluded. Let me correct." },
  ];

  it("TEXT stage (generation) — hard violation naming the slot", () => {
    const hard = applyQuestionRules({ paper: 1, questionText: "Identify each wine.", wines: winesFromText(wines) })
      .filter((v) => v.severity === "hard");
    expect(hard.map((v) => v.rule)).toContain("wine-reference-shape");
    expect(hard.find((v) => v.rule === "wine-reference-shape")!.detail).toContain("Wine 2");
  });

  it("engine wrapper fails the flight", () => {
    expect(validateWineReferenceShape(wines).valid).toBe(false);
    expect(validateWineReferenceShape([wines[0]]).valid).toBe(true);
  });

  it("KEY stage (audit) — only when the raw label is supplied", () => {
    // This is the whole reason the audit had to start carrying fullText: the resolver keys the
    // deliberation into a plausible-looking answer, so without the label there is nothing to catch.
    const key = [
      { slot: 1, varieties: ["Riesling"], region: "Alsace", country: "France" },
      { slot: 2, varieties: ["Muscat"], region: "Rutherglen", country: "Australia" },
    ];
    // R-COLOUR opt-out on both calls: slot 2 is a Rutherglen Muscat, which is FORTIFIED and so illegal
    // on Paper 1. That is intentional here — the fixture exists to prove the wine-reference-shape rule
    // needs the raw label, and swapping in a compliant wine would lose the malformed-slot case.
    const noColour = { paperScope: false } as const;
    expect(validateQuestion({ questionId: "x", paper: 1, family: "F4", questionText: "Identify each wine.", wines: key }, noColour).ok).toBe(true);

    const withLabels = key.map((w, i) => ({ ...w, fullText: wines[i].fullText }));
    const res = validateQuestion({ questionId: "x", paper: 1, family: "F4", questionText: "Identify each wine.", wines: withLabels }, noColour);
    expect(res.ok).toBe(false);
    expect(res.violations.map((v) => v.rule)).toContain("wine-reference-shape");
  });
});
