// sweep-wrong-colour.mjs — find and repair the damage a mis-classified colour did through R-COLOUR.
//
// R-COLOUR is unconditional and blocking, and it runs at generation, at serve time and in the post-save
// audit. So one wrong colour on one wine retires the whole question. On 2026-08-08 the enrichment
// classifier read "Benanti, Etna Bianco Superiore Pietra Marina" as RED — following Etna's Nerello
// Mascalese fame over both the word "Bianco" and its own grape list of Carricante — and the Paper 1
// question that served it was quarantined as containing a red wine.
//
// The classifier is fixed at source (reconcileColour in wine-enrichment.ts) and resolveWineScope now
// lets a stated label colour overrule a stored one. This script finds what the old behaviour already
// broke:
//
//   A. QUESTIONS quarantined on `wrong_colour_for_paper` whose violations no longer reproduce.
//   B. WINE BANK rows whose stored colour contradicts an explicit colour word on the label.
//   C. WINE_PROFILES slot colours doing the same, which is where the persisted value actually lives.
//
// Reports by default; only --apply writes. Nothing here re-runs the other validity rules: a question
// quarantined for something else stays quarantined, and only the stale colour entries are removed.
//
// Usage (from study-app/ — the ts-loader is required because this imports the app's .ts libs):
//   node --import ./scripts/ts-loader.mjs scripts/sweep-wrong-colour.mjs
//   node --import ./scripts/ts-loader.mjs scripts/sweep-wrong-colour.mjs --apply
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { explicitColourSignal, validatePaperColour } from "../src/lib/question-validator.ts";
// Load-bearing: registers the appellation → variety AND appellation → colour resolvers. Without it
// every appellation-only wine resolves to null and the recomputed verdict is not the one production
// would reach. Same trap as question-audit.ts.
import "../src/lib/appellation-resolver.ts";

const APPLY = process.argv.includes("--apply");

const DB =
  process.env.DATABASE_URL ||
  readFileSync(".env.local", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DB);

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const COLOURS = new Set(["white", "red", "rose", "orange"]);

/** The stated-colour contradiction, or null. Label basis only — a grape list is reported, never applied. */
function labelContradiction(fullText, varieties, stored) {
  if (!stored) return null;
  const signal = explicitColourSignal(fullText, varieties);
  if (!signal || signal.basis !== "label" || signal.colour === stored) return null;
  return signal.colour;
}

// ── A. Questions quarantined on a colour violation ───────────────────────────────────────────────────
async function sweepQuestions() {
  const rows = await sql`
    SELECT g.question_id, g.paper, g.wines, g.wine_profiles, g.invalid_reasons, g.question_text,
           k.ground_truth
    FROM generated_questions g
    LEFT JOIN stem_answer_keys k ON k.question_id = g.question_id
    WHERE g.invalid_reasons @> '[{"rule":"wrong_colour_for_paper"}]'::jsonb
    ORDER BY g.question_id`;

  console.log(`\n──── A. QUESTIONS QUARANTINED ON wrong_colour_for_paper: ${rows.length} ────\n`);
  const cleared = [];
  const partial = [];
  const stillBad = [];

  for (const r of rows) {
    const gt = parse(r.ground_truth) || [];
    const raw = parse(r.wines) || [];
    const profiles = parse(r.wine_profiles) || {};
    const bySlot = new Map((Array.isArray(raw) ? raw : []).map((w) => [w.slot, w.fullText ?? ""]));

    // Same zip as question-audit.ts: the key's varieties plus the raw label plus the persisted colour.
    const wines = (Array.isArray(gt) ? gt : []).map((w) => {
      const c = profiles?.[String(w.slot)]?.colour;
      return {
        ...w,
        ...(bySlot.has(w.slot) ? { fullText: bySlot.get(w.slot) } : {}),
        ...(COLOURS.has(c) ? { colour: c } : {}),
      };
    });

    const stored = parse(r.invalid_reasons) || [];
    const storedColour = stored.filter((v) => v.rule === "wrong_colour_for_paper");
    const other = stored.filter((v) => v.rule !== "wrong_colour_for_paper");
    const now = validatePaperColour(r.paper, wines, r.question_text).filter(
      (v) => v.rule === "wrong_colour_for_paper"
    );

    const entry = { id: r.question_id, paper: r.paper, was: storedColour.length, now: now.length, other, now_v: now };
    if (now.length === 0 && other.length === 0) cleared.push(entry);
    else if (now.length < storedColour.length || (now.length === 0 && other.length > 0)) partial.push(entry);
    else stillBad.push(entry);

    if (now.length === 0) {
      // Name the wine that changed its mind, so the report can be checked by eye.
      const flipped = wines
        .map((w) => ({ w, fix: labelContradiction(w.fullText, w.varieties, w.colour) }))
        .filter((x) => x.fix);
      for (const { w, fix } of flipped) {
        console.log(`  ${r.question_id} (P${r.paper}) wine ${w.slot}: stored "${w.colour}" → "${fix}"`);
        console.log(`      ${String(w.fullText || "").slice(0, 110)}`);
      }
      if (!flipped.length) {
        console.log(`  ${r.question_id} (P${r.paper}): colour violations no longer reproduce (no stored-colour flip)`);
      }
    }
  }

  console.log(
    `\n  fully clearable: ${cleared.length}   colour-clear but held by other rules: ${partial.length}   still colour-violating: ${stillBad.length}`
  );

  if (APPLY) {
    for (const e of [...cleared, ...partial]) {
      // Fix the persisted slot colours first, so a later re-audit reaches the same verdict from the
      // stored data alone rather than depending on the label override every time.
      const [q] = await sql`SELECT wines, wine_profiles FROM generated_questions WHERE question_id = ${e.id}`;
      const profiles = parse(q.wine_profiles) || {};
      const raw = parse(q.wines) || [];
      let touched = 0;
      for (const w of Array.isArray(raw) ? raw : []) {
        const p = profiles?.[String(w.slot)];
        const fix = p && labelContradiction(w.fullText, p.grape_varieties || [], p.colour);
        if (fix) { p.colour = fix; touched++; }
      }
      if (touched) {
        await sql`UPDATE generated_questions SET wine_profiles = ${JSON.stringify(profiles)}::jsonb
                  WHERE question_id = ${e.id}`;
      }

      // Then drop ONLY the stale colour entries; anything else keeps the question quarantined.
      const keep = [...e.other, ...e.now_v];
      const payload = keep.length ? JSON.stringify(keep) : null;
      await sql`UPDATE generated_questions SET invalid_reasons = ${payload}::jsonb WHERE question_id = ${e.id}`;
      await sql`UPDATE stem_answer_keys
                SET invalid_reasons = ${payload}::jsonb, validated = ${keep.length === 0}
                WHERE question_id = ${e.id}`;
      console.log(`  applied: ${e.id} — ${touched} slot colour(s) corrected, ${keep.length} reason(s) kept`);
    }
  }
  return { cleared: cleared.length, partial: partial.length, stillBad: stillBad.length };
}

// ── B. Wine bank rows whose stored colour the label contradicts ──────────────────────────────────────
async function sweepBank() {
  const rows = await sql`
    SELECT id, producer, wine_name, country, region, grape_varieties, style_category, colour
    FROM wine_bank WHERE colour IS NOT NULL ORDER BY id`;

  const labelFixes = [];
  const varietyFlags = [];
  for (const r of rows) {
    const fullText = [r.producer, r.wine_name, r.region, r.country].filter(Boolean).join(", ");
    const varieties = Array.isArray(r.grape_varieties) ? r.grape_varieties : [];
    const fix = labelContradiction(fullText, varieties, r.colour);
    if (fix) { labelFixes.push({ ...r, fullText, fix }); continue; }
    // Advisory only: the grape list disagreeing with the stored colour is suspicious but not decisive
    // (a rosé is made from red grapes, an orange wine from white ones), so it is never auto-applied.
    const signal = explicitColourSignal(fullText, varieties);
    if (signal?.basis === "variety" && signal.colour !== r.colour && (r.colour === "white" || r.colour === "red")) {
      varietyFlags.push({ ...r, fullText, suspect: signal.colour });
    }
  }

  console.log(`\n──── B. WINE BANK (${rows.length} rows with a stored colour) ────\n`);
  console.log(`  label contradicts stored colour: ${labelFixes.length}`);
  for (const r of labelFixes) console.log(`    ${r.colour} → ${r.fix}   ${r.fullText.slice(0, 100)}`);
  console.log(`\n  grape list disagrees (ADVISORY — not applied): ${varietyFlags.length}`);
  for (const r of varietyFlags.slice(0, 40)) {
    console.log(`    ${r.colour} vs ${r.suspect}   ${r.fullText.slice(0, 90)} [${(r.grape_varieties || []).join("/")}]`);
  }
  if (varietyFlags.length > 40) console.log(`    … and ${varietyFlags.length - 40} more`);

  if (APPLY) {
    for (const r of labelFixes) {
      await sql`UPDATE wine_bank SET colour = ${r.fix}, updated_at = now() WHERE id = ${r.id}`;
    }
    console.log(`\n  applied: ${labelFixes.length} wine_bank colour correction(s)`);
  }
  return { labelFixes: labelFixes.length, varietyFlags: varietyFlags.length };
}

// ── C. Slot colours on questions that were NOT quarantined ───────────────────────────────────────────
// The same bad colour on a Paper 3 wine, or on a wine whose paper happens to agree, sits there
// unnoticed until something reads it — the Live Tasting scope check, or a re-audit after a rule change.
async function sweepProfiles() {
  const rows = await sql`
    SELECT question_id, paper, wines, wine_profiles
    FROM generated_questions
    WHERE wine_profiles IS NOT NULL
      AND (invalid_reasons IS NULL OR NOT invalid_reasons @> '[{"rule":"wrong_colour_for_paper"}]'::jsonb)
    ORDER BY question_id`;

  const fixes = [];
  for (const r of rows) {
    const profiles = parse(r.wine_profiles) || {};
    const raw = parse(r.wines) || [];
    for (const w of Array.isArray(raw) ? raw : []) {
      const p = profiles?.[String(w.slot)];
      if (!p?.colour) continue;
      const fix = labelContradiction(w.fullText, p.grape_varieties || [], p.colour);
      if (fix) fixes.push({ id: r.question_id, paper: r.paper, slot: w.slot, from: p.colour, to: fix, fullText: w.fullText });
    }
  }

  console.log(`\n──── C. SLOT COLOURS ON NON-QUARANTINED QUESTIONS: ${fixes.length} ────\n`);
  for (const f of fixes.slice(0, 40)) {
    console.log(`    ${f.id} (P${f.paper}) w${f.slot}: ${f.from} → ${f.to}   ${String(f.fullText).slice(0, 90)}`);
  }
  if (fixes.length > 40) console.log(`    … and ${fixes.length - 40} more`);

  if (APPLY && fixes.length) {
    const byQuestion = new Map();
    for (const f of fixes) byQuestion.set(f.id, [...(byQuestion.get(f.id) || []), f]);
    for (const [id, list] of byQuestion) {
      const [q] = await sql`SELECT wine_profiles FROM generated_questions WHERE question_id = ${id}`;
      const profiles = parse(q.wine_profiles) || {};
      for (const f of list) if (profiles[String(f.slot)]) profiles[String(f.slot)].colour = f.to;
      await sql`UPDATE generated_questions SET wine_profiles = ${JSON.stringify(profiles)}::jsonb WHERE question_id = ${id}`;
    }
    console.log(`\n  applied: ${fixes.length} slot colour correction(s) across ${byQuestion.size} question(s)`);
  }
  return { fixes: fixes.length };
}

async function main() {
  console.log(APPLY ? "SWEEP — APPLYING WRITES" : "SWEEP — report only (pass --apply to write)");
  const a = await sweepQuestions();
  const b = await sweepBank();
  const c = await sweepProfiles();
  console.log(`\n──────── SUMMARY ────────`);
  console.log(`questions un-quarantinable:      ${a.cleared} (+${a.partial} colour-clear, held by other rules)`);
  console.log(`questions still colour-violating: ${a.stillBad}`);
  console.log(`wine_bank colours to correct:     ${b.labelFixes}  (advisory grape mismatches: ${b.varietyFlags})`);
  console.log(`slot colours to correct elsewhere: ${c.fixes}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
