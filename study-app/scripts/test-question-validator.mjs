// test-question-validator.mjs — framework-free tests for question-validator.ts (Node 24 type-strip).
import { validateQuestion } from "../src/lib/question-validator.ts";
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log("  FAIL:", name); } };
const W = (variety, country, region = "x", extra = {}) => ({ slot: 1, varieties: [variety], region, country, ...extra });

// R1 country diversity
ok("4 countries / 3 distinct (2 USA) = HARD", !validateQuestion({ questionId: "x", paper: 2, family: "F1", questionText: "Wines 1 to 4 are from four different countries.", wines: [W("Pinot Noir", "USA"), W("Pinot Noir", "USA"), W("Pinot Noir", "France"), W("Pinot Noir", "Australia")] }).ok);
ok("4 countries / 4 distinct = OK", validateQuestion({ questionId: "x", paper: 2, family: "F1", questionText: "four different countries", wines: [W("Syrah", "France"), W("Syrah", "Australia"), W("Syrah", "USA"), W("Syrah", "South Africa")] }).ok);
ok("bare 'different countries' / dup = HARD", !validateQuestion({ questionId: "x", paper: 1, family: "F4", questionText: "each from different countries", wines: [W("Riesling", "Germany"), W("Chardonnay", "Germany")] }).ok);

// R2 same variety
ok("same single grape variety / 2 grapes = HARD", !validateQuestion({ questionId: "x", paper: 1, family: "F1", questionText: "same single grape variety", wines: [W("Riesling", "DE"), W("Chardonnay", "FR")] }).ok);
ok("same variety / Shiraz==Syrah synonym = OK", validateQuestion({ questionId: "x", paper: 2, family: "F1", questionText: "same single grape variety, different countries", wines: [W("Shiraz", "AU"), W("Syrah", "FR")] }).ok === true || validateQuestion({ questionId: "x", paper: 2, family: "F1", questionText: "same single grape variety", wines: [W("Shiraz", "AU"), W("Syrah", "FR")] }).ok);

// R3 distinct varieties
ok("different varieties / duplicate = HARD", !validateQuestion({ questionId: "x", paper: 1, family: "F4", questionText: "each made from a different grape variety", wines: [W("Riesling", "DE"), W("Riesling", "FR")] }).ok);

// R4 same country
ok("same country / 2 countries = HARD", !validateQuestion({ questionId: "x", paper: 2, family: "F2", questionText: "from the same country", wines: [W("Nebbiolo", "Italy"), W("Tempranillo", "Spain")] }).ok);

// R5 single variety + blend is now SOFT (not disqualifying — co-ferments/dominant-grape blends are ok)
{ const r = validateQuestion({ questionId: "x", paper: 2, family: "F1", questionText: "a single grape variety", wines: [W("Cabernet Sauvignon", "CL", "x", { is_blend: true, varieties: ["Cabernet Sauvignon", "Merlot"] })] }); ok("single-variety + blend = SOFT (still ok)", r.ok && r.violations.some(x => x.rule === "single-variety-blend" && x.severity === "soft")); }
// "predominantly … single grape variety" explicitly permits blends ⇒ no flag at all
ok("predominantly + Tawny blend = OK", validateQuestion({ questionId: "x", paper: 3, family: "F4", questionText: "each made predominantly from a different, single grape variety", wines: [W("Touriga Nacional", "Portugal", "Douro", { is_blend: true, varieties: ["Touriga Nacional", "Touriga Franca"] }), W("Palomino", "Spain")] }).ok);

// Subset/pair-split stems are skipped (no false positives) — pairs each same country is valid
ok("pair-split (1&2 / 3&4) = OK (skipped)", validateQuestion({ questionId: "x", paper: 2, family: "F7", questionText: "Wines 1 and 2 are from the same country. Wines 3 and 4 are from the same country.", wines: [W("Pinot Noir", "France"), W("Pinot Noir", "France"), W("Pinot Noir", "New Zealand"), W("Pinot Noir", "New Zealand")] }).ok);
ok("subset (1&2 same, wine 3 different) = OK (skipped)", validateQuestion({ questionId: "x", paper: 3, family: "F3", questionText: "Wines 1 and 2 are from the same region and same single grape variety. Wine 3 is from a different country.", wines: [W("Palomino", "Spain", "Jerez"), W("Palomino", "Spain", "Jerez"), W("Sercial", "Portugal", "Madeira", { is_blend: true, varieties: ["Sercial", "Verdelho"] })] }).ok);

// no claim ⇒ OK (no false positives on a grab-bag)
ok("no same/different claim = OK", validateQuestion({ questionId: "x", paper: 1, family: "F4", questionText: "Identify each wine.", wines: [W("Chardonnay", "FR"), W("Riesling", "DE")] }).ok);

// R6 marks soft (does not disqualify)
{ const r = validateQuestion({ questionId: "x", paper: 1, family: "F4", questionText: "Identify each.", totalMarks: 40, wines: [W("a", "FR"), W("b", "DE")] }); ok("marks mismatch = soft (still ok)", r.ok && r.violations.some(v => v.rule === "marks" && v.severity === "soft")); }

console.log(`\nquestion-validator tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
