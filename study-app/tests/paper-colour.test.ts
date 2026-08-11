// paper-colour.test.ts — R-COLOUR (Right Paper Check): Paper 1 still-white only, Paper 2 still-red
// only, Paper 3 unrestricted. Colour is derived from the wine record's existing style/label/variety
// fields; the rule is unconditional and fails safe on wines whose colour cannot be positively placed.
import { describe, it, expect } from "vitest";
import { classifyWineColour, resolveWineScope, validatePaperColour, validateQuestion } from "../src/lib/question-validator";
import type { AuditWine } from "../src/lib/question-validator";
// Registers the appellation → primary-variety fallback. Without this import detectPrimaryVariety
// returns "unknown" and every appellation-only label below resolves to null — which is exactly the
// production hole (the corpus sweep never registered it). Asserted explicitly further down.
import "../src/lib/appellation-resolver";

const wine = (over: Partial<AuditWine>): AuditWine => ({ slot: 1, varieties: [], region: "", ...over });

describe("classifyWineColour", () => {
  it.each([
    ["still white", { varieties: ["Chardonnay"], region: "Chablis", fullText: "Domaine X Chablis 2021. Burgundy, France." }, "white"],
    ["still red", { varieties: ["Nebbiolo"], region: "Barolo", fullText: "Producer Barolo 2018. Piedmont, Italy." }, "red"],
    ["sparkling", { fullText: "Grower Champagne Brut NV. Champagne, France.", style: "sparkling" }, "sparkling"],
    ["sweet", { fullText: "Château Y Sauternes 2016. Bordeaux, France.", style_category: "Botrytis sweet" }, "sweet"],
    ["fortified", { fullText: "Taylor's Vintage Port 1985. Douro, Portugal. (20.5%)" }, "fortified"],
    ["rosé", { fullText: "Domaine Z Rosé 2022. Provence, France.", varieties: ["Grenache"] }, "rose"],
    ["orange", { fullText: "Pheasant's Tears Rkatsiteli qvevri 2019. Kakheti, Georgia." }, "orange"],
  ])("classifies %s", (_label, w, expected) => {
    expect(classifyWineColour(wine(w as Partial<AuditWine>))).toBe(expected);
  });

  it("returns null when a still wine's colour cannot be placed (fail safe)", () => {
    expect(classifyWineColour(wine({ fullText: "Mystery Cuvée 2020." }))).toBeNull();
  });
});

describe("validatePaperColour", () => {
  const red = wine({ slot: 2, varieties: ["Syrah"], region: "Hermitage", fullText: "Producer Hermitage 2018. Rhône, France." });
  const white = wine({ slot: 1, varieties: ["Riesling"], region: "Mosel", fullText: "Producer Riesling 2021. Mosel, Germany." });

  it("rejects a red wine on Paper 1", () => {
    const v = validatePaperColour(1, [white, red]);
    expect(v.some((x) => x.rule === "wrong_colour_for_paper" && x.severity === "hard" && x.detail.includes("wine 2"))).toBe(true);
  });

  it("rejects a white wine on Paper 2", () => {
    const v = validatePaperColour(2, [white, red]);
    expect(v.some((x) => x.rule === "wrong_colour_for_paper" && x.detail.includes("wine 1"))).toBe(true);
  });

  it("passes an all-white Paper 1 flight", () => {
    expect(validatePaperColour(1, [white])).toHaveLength(0);
  });

  it("never restricts Paper 3", () => {
    expect(validatePaperColour(3, [white, red])).toHaveLength(0);
  });

  it("flags a stem that implies a forbidden colour (stem_colour_conflict), unconditional", () => {
    const v = validatePaperColour(1, [white], "These four red wines are from the same grape variety.");
    expect(v.some((x) => x.rule === "stem_colour_conflict" && x.severity === "hard")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// The two axes are INDEPENDENT. Regression cover for the collapse bug: classifyWineColour used to
// return a single enum with style beating colour, so a Riesling Spätlese resolved "sweet" instead of
// "white" and failed Paper 1 — while the generation prompt explicitly invites it. 16 live Paper 1
// questions depended on that allowance.
// ---------------------------------------------------------------------------------------------------
describe("resolveWineScope — colour and style resolve independently", () => {
  it.each([
    ["Riesling Spätlese", { varieties: ["Riesling"], region: "Mosel", fullText: "Weingut X, Riesling Spätlese, 2021. Mosel, Germany. (8%)" }, "white", "sweet"],
    // demi-sec is OFF-dry, and the shared SWEET regex deliberately requires named sweetness
    // (auslese, moelleux, aszú…), so this resolves "still". What matters for paper scope is that it
    // is white and therefore legal on Paper 1 — asserted in the next test.
    ["Vouvray demi-sec", { varieties: ["Chenin Blanc"], region: "Vouvray", fullText: "Producer, Vouvray demi-sec, 2020. Loire, France." }, "white", "still"],
    ["rosé Champagne", { varieties: ["Pinot Noir"], region: "Champagne", fullText: "House, Rosé Champagne Brut NV. Champagne, France." }, "rose", "sparkling"],
    ["white Rioja (oxidative)", { varieties: ["Viura"], region: "Rioja", fullText: "López de Heredia, Viña Tondonia Blanco Reserva, 2011. Rioja, Spain." }, "white", "oxidative"],
    ["Vintage Port", { varieties: ["Touriga Nacional"], region: "Douro", fullText: "Taylor's Vintage Port 1985. Douro, Portugal. (20.5%)" }, "red", "fortified"],
  ])("%s resolves colour + style separately", (_l, w, colour, style) => {
    const got = resolveWineScope(wine(w as Partial<AuditWine>));
    expect(got.colour).toBe(colour);
    expect(got.style).toBe(style);
  });

  it("a sweet white and an oxidative white both PASS Paper 1 — the 16-question regression", () => {
    const spatlese = wine({ slot: 1, varieties: ["Riesling"], region: "Mosel", fullText: "Weingut X, Riesling Spätlese, 2021. Mosel, Germany. (8%)" });
    const demiSec = wine({ slot: 2, varieties: ["Chenin Blanc"], region: "Vouvray", fullText: "Producer, Vouvray demi-sec, 2020. Loire, France." });
    const whiteRioja = wine({ slot: 3, varieties: ["Viura"], region: "Rioja", fullText: "López de Heredia, Viña Tondonia Blanco Reserva, 2011. Rioja, Spain." });
    expect(validatePaperColour(1, [spatlese, demiSec, whiteRioja])).toHaveLength(0);
  });

  it("still blocks fortified and sparkling on Paper 1", () => {
    const fino = wine({ slot: 1, fullText: "Bodegas X, Fino en Rama, NV. Jerez, Spain. (15%)" });
    const fizz = wine({ slot: 2, fullText: "House, Champagne Brut NV. Champagne, France.", style: "sparkling" });
    for (const w of [fino, fizz]) {
      expect(validatePaperColour(1, [w]).some((x) => x.rule === "wrong_colour_for_paper")).toBe(true);
    }
  });

  // Dual-purpose regions: famous for a fortified wine, but also making dry table wine under the same
  // name. The bare region name must not condemn the dry version — each of these was rejecting a
  // legitimate Paper 2 red in the live bank.
  it.each([
    ["Maury Sec", { fullText: "Mas Amiel, Maury Sec. Roussillon, France." }, "still"],
    ["Rasteau dry red", { fullText: "Domaine de la Mordorée, Rasteau Grenache Noir, 2019. Rasteau, France." }, "still"],
    ["Rutherglen Petite Sirah", { varieties: ["Petite Sirah"], region: "Rutherglen", fullText: "Producer, Petite Sirah, 2019. Rutherglen, Australia." }, "still"],
  ])("%s is a dry still wine, not fortified", (_l, w, expected) => {
    expect(resolveWineScope(wine(w as Partial<AuditWine>)).style).toBe(expected);
  });

  it.each([
    ["Rutherglen Muscat", "Chambers, Rare Muscat, NV. Rutherglen, Australia. (18%)"],
    ["Rasteau VDN", "Domaine X, Rasteau Vin Doux Naturel, 2018. Rhône, France. (16%)"],
  ])("%s IS still fortified — the positive marker is present", (_l, fullText) => {
    expect(resolveWineScope(wine({ fullText })).style).toBe("fortified");
  });

  it.each(["Manzanilla", "Fino", "Oloroso", "Amontillado", "Palo Cortado"])(
    "%s Sherry is fortified and fails Paper 1 (the reported miss)",
    (styleName) => {
      const w = wine({ slot: 1, varieties: ["Palomino"], region: "Jerez", fullText: `Bodegas X, ${styleName}, NV. Jerez-Xérès-Sherry, Spain. (15.5%)` });
      expect(resolveWineScope(w).style).toBe("fortified");
      expect(validatePaperColour(1, [w]).some((x) => x.rule === "wrong_colour_for_paper")).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------------------------------
// Colour resolution accuracy — the wines that actually reached Paper 1 in production, and the mirror
// false-positives the fix must NOT introduce.
// ---------------------------------------------------------------------------------------------------
describe("colour resolution — appellation-only labels and colour qualifiers", () => {
  // These name no grape at all. They are the wines found live on Paper 1, and they resolve only via
  // the appellation → primary-variety fallback.
  it.each([
    ["Hermitage", "Domaine Jean-Louis Chave, Hermitage, 2019. Northern Rhône, France. (14%)"],
    ["Châteauneuf-du-Pape", "Clos des Papes, Châteauneuf-du-Pape, 2019. Southern Rhône, France. (14.5%)"],
    ["Moulin-à-Vent", "Château du Moulin-à-Vent, Moulin-à-Vent, 2020. Beaujolais, France. (13%)"],
    ["Amarone", "Producer, Amarone della Valpolicella Classico, 2016. Veneto, Italy. (15.5%)"],
    ["Montepulciano d'Abruzzo", "Producer, Montepulciano d'Abruzzo, 2020. Abruzzo, Italy. (13.5%)"],
  ])("%s resolves red from the appellation alone", (_l, fullText) => {
    expect(resolveWineScope(wine({ fullText })).colour).toBe("red");
    expect(validatePaperColour(1, [wine({ slot: 1, fullText })]).some((x) => x.rule === "wrong_colour_for_paper")).toBe(true);
  });

  // A red grape name qualified as a white bottling IS white.
  it.each([
    ["Touriga Nacional Branco", { varieties: ["Touriga Nacional"], fullText: "Quinta dos Roques, Touriga Nacional Branco, 2022. Dão, Portugal." }],
    ["Xinomavro White", { varieties: ["Xinomavro"], fullText: "Varvaresos, Xinomavro White, 2022. Naoussa, Greece. (13%)" }],
  ])("%s resolves white — the colour qualifier overrides the grape", (_l, w) => {
    expect(resolveWineScope(wine(w as Partial<AuditWine>)).colour).toBe("white");
  });

  // The mirror risk of that override. French `blanc` is deliberately NOT an override token because it
  // appears inside proprietary names of famous REDS.
  it.each([
    ["Château Cheval Blanc", { varieties: ["Cabernet Franc", "Merlot"], region: "Saint-Émilion", fullText: "Château Cheval Blanc, 2015. Saint-Émilion, Bordeaux, France. (14%)" }],
    ["Domaine Paul Blanck Pinot Noir", { varieties: ["Pinot Noir"], region: "Alsace", fullText: "Domaine Paul Blanck, Pinot Noir, 2021. Alsace, France." }],
  ])("%s still resolves RED (no false white)", (_l, w) => {
    expect(resolveWineScope(wine(w as Partial<AuditWine>)).colour).toBe("red");
  });

  // The appellation COLOUR table reaches further than the appellation VARIETY table. Variety must
  // decline a multi-variety appellation (St-Julien cannot be reduced to one grape), but colour survives
  // that ambiguity because all four grapes are red. 238 appellations become colour evidence where only
  // 117 were variety evidence.
  it.each([
    ["Saint-Julien", "Château Léoville-Barton, Saint-Julien, 2016. Bordeaux, France.", "red"],
    ["Saint-Estèphe", "Château Montrose, Saint-Estèphe, 2015. Bordeaux, France.", "red"],
    ["Bandol", "Domaine Tempier, Bandol, 2019. Provence, France.", "red"],
  ])("%s resolves %s from a multi-variety appellation", (_l, fullText, expected) => {
    expect(resolveWineScope(wine({ fullText })).colour).toBe(expected);
  });

  // Two-colour appellations must not be guessed — only the label settles them.
  it.each([
    ["Graves Blanc", "Château X, Graves Blanc, 2021. Bordeaux, France.", "white"],
    ["Graves Rouge", "Château X, Graves Rouge, 2018. Bordeaux, France.", "red"],
    ["Anjou Blanc", "Domaine Y, Anjou Blanc, 2022. Loire, France.", "white"],
  ])("%s takes its colour from the label", (_l, fullText, expected) => {
    expect(resolveWineScope(wine({ fullText })).colour).toBe(expected);
  });

  it("the appellation resolver is actually registered in this process", () => {
    // Guards the production hole: scripts/audit-questions.mjs and question-audit.ts must import
    // @/lib/appellation-resolver or every appellation-only wine silently resolves to null.
    expect(resolveWineScope(wine({ fullText: "Producer, Barolo, 2018. Piedmont, Italy." })).colour).toBe("red");
  });
});

// ---------------------------------------------------------------------------------------------------
// WIRING. The rule being correct was never the problem — it ran in exactly one place. These assertions
// pin it into the shared audit wrapper, which is what makes auditAndQuarantineQuestion() and
// scripts/audit-questions.mjs able to quarantine a wrong-colour row at all.
// ---------------------------------------------------------------------------------------------------
describe("validateQuestion enforces the paper-scope contract", () => {
  const redOnP1 = {
    questionId: "wiring",
    paper: 1,
    family: "F1",
    questionText: "Wines 1 and 2 are from the same country. Identify the grape variety of each.",
    wines: [
      { slot: 1, varieties: ["Chardonnay"], region: "Chablis", country: "France", fullText: "Domaine A, Chablis, 2021. Burgundy, France." },
      { slot: 2, varieties: ["Syrah"], region: "Hermitage", country: "France", fullText: "Domaine Jean-Louis Chave, Hermitage, 2019. Northern Rhône, France." },
    ],
  };

  it("emits wrong_colour_for_paper by default — the regression the old exclusion allowed", () => {
    const res = validateQuestion(redOnP1);
    expect(res.violations.some((v) => v.rule === "wrong_colour_for_paper")).toBe(true);
    expect(res.ok).toBe(false); // hard, so auditAndQuarantineQuestion writes invalid_reasons
  });

  it("can be opted out ONLY explicitly (for colour-incoherent fixtures)", () => {
    expect(validateQuestion(redOnP1, { paperScope: false }).violations.some((v) => v.rule === "wrong_colour_for_paper")).toBe(false);
  });

  it("leaves a compliant all-white Paper 1 flight alone", () => {
    const clean = { ...redOnP1, wines: [redOnP1.wines[0]] };
    expect(validateQuestion(clean).violations.some((v) => v.rule === "wrong_colour_for_paper")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// A PERSISTED colour outranks inference. It was decided at generation time with varieties, region and
// enrichment in hand; a serve-time caller re-deriving from a bare label is strictly worse informed.
// ---------------------------------------------------------------------------------------------------
describe("persisted colour wins over inference", () => {
  it("believes the stored colour even when the label argues otherwise", () => {
    // A white wine from a red-grape region. Inference would say red off the Syrah/Hermitage; the stored
    // value is what the enrichment step actually resolved, so it wins.
    const w = wine({ varieties: ["Syrah"], region: "Hermitage", fullText: "Producer, Hermitage Blanc equivalent", colour: "white" });
    expect(resolveWineScope(w).colour).toBe("white");
    expect(validatePaperColour(1, [w])).toHaveLength(0);
  });

  it("still resolves STYLE independently of the persisted colour", () => {
    const w = wine({ fullText: "House, Rosé Champagne Brut NV. Champagne, France.", colour: "rose" });
    const got = resolveWineScope(w);
    expect(got.colour).toBe("rose");
    expect(got.style).toBe("sparkling"); // persisted colour must not short-circuit the style axis
  });

  it("falls back to inference when nothing is stored", () => {
    expect(resolveWineScope(wine({ varieties: ["Syrah"], region: "Hermitage", fullText: "Producer, Hermitage, 2019." })).colour).toBe("red");
  });
});

describe("indeterminate colour is asymmetric by path", () => {
  const mystery = wine({ slot: 1, fullText: "Mystery Cuvée 2020." });

  it("is exempt by default (defensive serve-time backstop / Live Tasting) — never retire a banked wine on lack of evidence", () => {
    expect(validatePaperColour(1, [mystery])).toHaveLength(0);
  });

  it("blocks as colour_unknown when the caller asks (generation + the authoritative audit path)", () => {
    const v = validatePaperColour(1, [mystery], undefined, { blockIndeterminate: true });
    expect(v.some((x) => x.rule === "colour_unknown" && x.severity === "hard")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// R-COLOUR is now a HARD VALIDATION FAILURE, not merely a serve-time filter (fb_499/fb_502, reviewer
// #502: a white Gewürztraminer kept reaching Paper 2 red flights because it was only serve-gated —
// the bad question was still generated, validated and banked). validateQuestion is the one
// authoritative gate, and it opts in to `blockIndeterminate`, so a wine with no derivable colour
// fails HARD as colour_unknown rather than passing by default.
// ---------------------------------------------------------------------------------------------------
describe("Paper 2 rejects white wines at validation time (the recurring fault cluster)", () => {
  const q = (wines: Partial<AuditWine>[]) => ({
    questionId: "p2-colour",
    paper: 2,
    family: "F2",
    questionText:
      "Wines 5 and 6 are from the same country but from different regions. With reference to both wines: a) Identify the country.",
    wines: wines.map((w, i) => ({ slot: i + 5, varieties: [], region: "", ...w })),
  });

  it("fails a Paper 2 flight containing a Gewürztraminer, naming the offending wine and its colour", () => {
    const res = validateQuestion(
      q([
        { varieties: ["Nebbiolo"], region: "Barolo", country: "Italy", fullText: "Producer, Barolo, 2018. Piedmont, Italy." },
        { varieties: ["Gewürztraminer"], region: "Alto Adige", country: "Italy", fullText: "Producer, Gewürztraminer, 2021. Alto Adige, Italy." },
      ]),
    );
    const hit = res.violations.find(
      (v) => v.rule === "wrong_colour_for_paper" && v.severity === "hard" && v.detail.includes("wine 6"),
    );
    expect(hit).toBeTruthy();
    expect(hit!.detail).toContain("white");
    expect(res.ok).toBe(false);
  });

  it("passes an all-red Paper 2 flight", () => {
    const res = validateQuestion(
      q([
        { varieties: ["Nebbiolo"], region: "Barolo", country: "Italy", fullText: "Producer, Barolo, 2018. Piedmont, Italy." },
        { varieties: ["Sangiovese"], region: "Chianti Classico", country: "Italy", fullText: "Producer, Chianti Classico, 2019. Tuscany, Italy." },
      ]),
    );
    expect(res.violations.some((v) => v.rule === "wrong_colour_for_paper" || v.rule === "colour_unknown")).toBe(false);
  });

  it("fails a Paper 2 wine with no derivable colour as colour_unknown, naming the wine", () => {
    const res = validateQuestion(
      q([
        { varieties: ["Nebbiolo"], region: "Barolo", country: "Italy", fullText: "Producer, Barolo, 2018. Piedmont, Italy." },
        { fullText: "Mystery Cuvée 2020." },
      ]),
    );
    const hit = res.violations.find(
      (v) => v.rule === "colour_unknown" && v.severity === "hard" && v.detail.includes("wine 6"),
    );
    expect(hit).toBeTruthy();
    expect(res.ok).toBe(false);
  });
});
