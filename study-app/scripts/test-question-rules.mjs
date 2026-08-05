// test-question-rules.mjs — regression guard for the shared rule layer (src/lib/question-rules.mjs),
// the single source of truth for the stem<->wine contradiction rules used by BOTH the generation
// engine (text adapter) and the audit/feedback validator (key adapter).
//
//   node study-app/scripts/test-question-rules.mjs
//
// Two batteries:
//  1. EK regression (TEXT path, winesFromText + applyQuestionRules): the historical bad-question
//     shapes that drove past EK complaints MUST still be caught, with no over-flagging of clean ones.
//  2. Validator parity (KEY path, validateQuestion): locks the audit/feedback behaviour.
// Exits non-zero on any failure.

import { winesFromText, applyQuestionRules } from "../src/lib/question-rules.mjs";
import { validateQuestion } from "../src/lib/question-validator.ts";

let failures = 0;
const W = (slot, fullText) => ({ slot, fullText });
const ENGINE_OPTS = { countryRequireAllKnown: true };
const textRules = (paper, questionText, totalMarks, wines) =>
  applyQuestionRules({ paper, questionText, totalMarks, wines: winesFromText(wines) }, ENGINE_OPTS).map((v) => v.rule).sort();

// ---------- 1. EK regression (text path) ----------
// Labels are in the corpus format the generator actually emits — "Producer, wine name, vintage.
// Region, Country. (ABV%)" — not shorthand. They used to be shorthand ("Caymus Cabernet Sauvignon,
// Napa, USA (14.5%)"), which meant every fixture tripped the wine-reference-shape rule and each case's
// printed rule list carried noise that had nothing to do with what it was testing.
const ek = [
  { name: "EK four-countries / two-USA", inc: ["country-diversity"], paper: 2, marks: 100,
    stem: "Wines 1 to 4 come from four different countries.",
    wines: [W(1, "Château Margaux, Grand Vin, 2016. Margaux, Bordeaux, France. (13.5%)"), W(2, "Produttori del Barbaresco, Barbaresco DOCG, 2019. Piedmont, Italy. (14.0%)"), W(3, "Caymus Vineyards, Cabernet Sauvignon, 2020. Napa Valley, California, USA. (14.5%)"), W(4, "Columbia Crest, H3 Merlot, 2021. Horse Heaven Hills, Washington, USA. (13.5%)")] },
  { name: "EK same-variety with two varieties", inc: ["same-variety"], paper: 1, marks: 50,
    stem: "Wines 1 to 2 are from the same single grape variety.",
    wines: [W(1, "Domaine Leflaive, Mâcon-Verzé Chardonnay, 2023. Mâcon, Burgundy, France. (13.0%)"), W(2, "Dr. Loosen, Blue Slate Riesling Kabinett, 2022. Mosel, Germany. (8.5%)")] },
  { name: "stricter two-countries all-one-country", inc: ["country-diversity"], paper: 2, marks: 75,
    stem: "Wines 1 to 3 are from two different countries.",
    wines: [W(1, "Penfolds, Bin 128 Shiraz, 2021. Coonawarra, South Australia, Australia. (14.0%)"), W(2, "Henschke, Mount Edelstone Shiraz, 2019. Eden Valley, South Australia, Australia. (14.5%)"), W(3, "Torbreck, Les Amis Grenache, 2018. Barossa Valley, South Australia, Australia. (15.0%)")] },
  { name: "guard: detection gap -> no false flag", exc: ["country-diversity", "wine-reference-shape"], paper: 1, marks: 75,
    stem: "Wines 1 to 3 come from three different countries.",
    // Wine 3's country is absent from detectCountryName's (deliberately narrow, order-sensitive) list,
    // so country-diversity must skip the flight rather than flag it. The shape rule's origin anchor is
    // a SUPERSET of that list and knows Slovakia — the two lists differ on purpose, and this pins it.
    wines: [W(1, "Cloudy Bay, Sauvignon Blanc, 2023. Marlborough, New Zealand. (13.0%)"), W(2, "Domaine Vacheron, Sancerre Blanc, 2022. Loire Valley, France. (12.5%)"), W(3, "Château Belá, Riesling, 2021. Muzla, Slovakia. (12.5%)")] },
  { name: "clean same-variety all Chardonnay", exc: ["same-variety", "country-diversity", "wine-reference-shape"], paper: 1, marks: 50,
    stem: "Wines 1 to 2 are from the same single grape variety.",
    wines: [W(1, "Domaine Leflaive, Mâcon-Verzé Chardonnay, 2023. Mâcon, Burgundy, France. (13.0%)"), W(2, "Kumeu River, Estate Chardonnay, 2022. Auckland, New Zealand. (13.5%)")] },
  { name: "clean three genuinely-different countries", exc: ["country-diversity", "wine-reference-shape"], paper: 1, marks: 75,
    stem: "Wines 1 to 3 come from three different countries, each a different grape variety.",
    wines: [W(1, "Louis Jadot, Bourgogne Chardonnay, 2022. Burgundy, France. (13.0%)"), W(2, "Pewsey Vale, Riesling, 2022. Eden Valley, South Australia, Australia. (12.0%)"), W(3, "Ken Forrester, Old Vine Reserve Chenin Blanc, 2022. Stellenbosch, South Africa. (13.5%)")] },
];
console.log("== EK regression (text path) ==");
for (const c of ek) {
  const got = textRules(c.paper, c.stem, c.marks, c.wines);
  const ok = (c.inc || []).every((r) => got.includes(r)) && (c.exc || []).every((r) => !got.includes(r));
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}  [${got.join(", ")}]`);
}

// ---------- 2. Validator parity (key path) ----------
const V = (slot, varieties, region, country, extra = {}) => ({ slot, varieties, region, country, ...extra });
const val = [
  { name: "same-variety violation", ok: false, sm: "set", viol: ["same-variety:hard"], q: { questionId: "c1", paper: 1, family: "F1", questionText: "Wines 1 to 3 are from the same single grape variety. (3 x 25 marks)", totalMarks: 75, wines: [V(1, ["Chardonnay"], "Burgundy", "France"), V(2, ["Pinot Noir"], "Mosel", "Germany"), V(3, ["Chardonnay"], "Margaret River", "Australia")] } },
  { name: "same-variety ok (synonyms)", ok: true, sm: "set", viol: [], q: { questionId: "c2", paper: 2, family: "F1", questionText: "Wines 1 to 2 are from the same single grape variety. (2 x 25 marks)", totalMarks: 50, wines: [V(1, ["Syrah"], "Northern Rhône", "France"), V(2, ["Shiraz"], "Barossa", "Australia")] } },
  { name: "different-countries", ok: false, sm: "per-wine", viol: ["country-diversity:hard"], q: { questionId: "c3", paper: 2, family: "F2", questionText: "Wines 1 to 3 come from three different countries. (3 x 25 marks)", totalMarks: 75, wines: [V(1, ["Cabernet Sauvignon"], "Napa", "USA"), V(2, ["Malbec"], "Mendoza", "Argentina"), V(3, ["Merlot"], "Washington", "USA")] } },
  { name: "distinct-variety", ok: false, sm: "per-wine", viol: ["distinct-variety:hard"], q: { questionId: "c4", paper: 2, family: "F2", questionText: "Wines 1 to 3 are each a different grape variety. (3 x 25 marks)", totalMarks: 75, wines: [V(1, ["Tempranillo"], "Rioja", "Spain"), V(2, ["Tempranillo"], "Ribera del Duero", "Spain"), V(3, ["Garnacha"], "Priorat", "Spain")] } },
  { name: "same-country", ok: false, sm: "per-wine", viol: ["same-country:hard"], q: { questionId: "c5", paper: 1, family: "F2", questionText: "Wines 1 to 2 are from the same country. (2 x 25 marks)", totalMarks: 50, wines: [V(1, ["Riesling"], "Mosel", "Germany"), V(2, ["Grüner Veltliner"], "Wachau", "Austria")] } },
  { name: "marks", ok: false, sm: "per-wine", viol: ["marks:hard"], q: { questionId: "c6", paper: 2, family: "F4", questionText: "Wines 1 to 4, comment on each. (4 x 18 marks + 3)", totalMarks: 75, wines: [V(1, ["Nebbiolo"], "Barolo", "Italy"), V(2, ["Sangiovese"], "Chianti", "Italy"), V(3, ["Cabernet Sauvignon"], "Bolgheri", "Italy"), V(4, ["Aglianico"], "Taurasi", "Italy")] } },
  { name: "p3 oxidative white", ok: false, sm: "per-wine", viol: ["p3-oxidative-white:hard"], q: { questionId: "c7", paper: 3, family: "F6", questionText: "Wines 1 to 2 are oxidative whites. (2 x 25 marks)", totalMarks: 50, wines: [V(1, ["Viura"], "Rioja Blanco Gran Reserva", "Spain", { style: "oxidative white" }), V(2, ["Semillon"], "Hunter Valley", "Australia", { style: "oxidative white" })] } },
  { name: "subset-split", ok: true, sm: "per-wine", viol: [], q: { questionId: "c8", paper: 2, family: "F4", questionText: "Wines 1 and 2 are from the same country; the other two are from a different country. (4 x 25 marks)", totalMarks: 100, wines: [V(1, ["Syrah"], "Northern Rhône", "France"), V(2, ["Grenache"], "Châteauneuf", "France"), V(3, ["Shiraz"], "Barossa", "Australia"), V(4, ["Grenache"], "McLaren Vale", "Australia")] } },
  { name: "single-variety blend soft", ok: true, sm: "per-wine", viol: ["single-variety-blend:soft"], q: { questionId: "c9", paper: 2, family: "F1", questionText: "Wines 1 to 2 are a single grape variety. (2 x 25 marks)", totalMarks: 50, wines: [V(1, ["Syrah"], "Hermitage", "France"), V(2, ["Grenache", "Syrah", "Mourvèdre"], "Châteauneuf", "France", { is_blend: true })] } },
  { name: "clean", ok: true, sm: "per-wine", viol: [], q: { questionId: "c10", paper: 1, family: "F2", questionText: "Wines 1 to 3 come from three different countries, each a different grape variety. (3 x 25 marks)", totalMarks: 75, wines: [V(1, ["Chardonnay"], "Burgundy", "France"), V(2, ["Riesling"], "Clare Valley", "Australia"), V(3, ["Chenin Blanc"], "Stellenbosch", "South Africa")] } },
];
console.log("== Validator parity (key path) ==");
for (const c of val) {
  const r = validateQuestion(c.q);
  const got = r.violations.map((v) => `${v.rule}:${v.severity}`).sort();
  const ok = r.ok === c.ok && r.scoringModel === c.sm && JSON.stringify(got) === JSON.stringify([...c.viol].sort());
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}${ok ? "" : ` — ok=${r.ok} sm=${r.scoringModel} [${got.join(", ")}]`}`);
}

console.log(`\n${failures === 0 ? "ALL QUESTION-RULES TESTS PASSED" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
