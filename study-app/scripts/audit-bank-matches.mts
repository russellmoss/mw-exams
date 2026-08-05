// One-off audit (2026-08-05): re-run the tightened wine-bank matcher against every stored
// generated_questions wine slot with source_method='bank_lookup' and report slots whose stored
// bank_match no longer passes — i.e. wrong-cuvée provenance served before the cuvée gate existed.
// Run from study-app/: node --env-file=.env.local scripts/audit-bank-matches.ts
import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { matchScore, lookupWine, lookupWines, type WineBankEntry } from "../src/lib/wine-bank-lookup";

// Self-load .env.local so the script runs under plain `npx tsx` (no --env-file needed).
if (!process.env.DATABASE_URL) {
  for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
  }
}

const sql = neon(process.env.DATABASE_URL!);

// Hydrate the module's cached bank with DB rows so lookupWine sees everything the app sees.
await lookupWines([]);

const byId = new Map<string, WineBankEntry>();
try {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "mock_wine_bank.json"), "utf-8"));
  for (const e of Array.isArray(raw) ? raw : raw.wines || []) byId.set(e.id, e);
} catch {}
const bankRows = await sql`SELECT id, producer, wine_name FROM wine_bank`;
for (const r of bankRows) {
  if (!byId.has(r.id as string)) {
    byId.set(r.id as string, {
      id: r.id, producer: r.producer, wine_name: r.wine_name,
      country: "", region: "", grape_varieties: [], style_category: "still_dry",
    } as WineBankEntry);
  }
}

const rows = await sql`
  SELECT question_id, wines, wine_profiles, is_retired
  FROM generated_questions
  WHERE wine_profiles IS NOT NULL
`;

let slots = 0;
const mismatches: object[] = [];
for (const row of rows) {
  const wines = (typeof row.wines === "string" ? JSON.parse(row.wines) : row.wines) as { slot: number; fullText: string }[];
  const profiles = row.wine_profiles as Record<string, { source_method?: string; bank_match?: string | null }>;
  for (const [slot, p] of Object.entries(profiles)) {
    if (p?.source_method !== "bank_lookup" || !p.bank_match) continue;
    const wine = wines.find((w) => String(w.slot) === slot);
    if (!wine) continue;
    slots++;
    const stored = byId.get(p.bank_match);
    const storedScore = stored ? matchScore(wine.fullText, stored) : 0;
    if (storedScore >= 0.7) continue;
    const best = lookupWine(wine.fullText);
    mismatches.push({
      question_id: row.question_id,
      retired: row.is_retired,
      slot: Number(slot),
      fullText: wine.fullText,
      stored_match: p.bank_match,
      stored_wine_name: stored?.wine_name ?? "(bank row missing)",
      stored_score_now: Number(storedScore.toFixed(3)),
      new_best: best ? { id: best.entry.id, score: Number(best.score.toFixed(3)) } : null,
    });
  }
}

console.log(JSON.stringify({ bank_lookup_slots: slots, mismatch_count: mismatches.length, mismatches }, null, 2));

// --apply: null the mismatched slots so they stop serving another cuvée's profile and citations.
// A cleared slot reads as "never researched" (source_method 'none'), which is what the tightened
// matcher would have produced. Backs up every replaced slot profile first.
if (process.argv.includes("--apply") && mismatches.length > 0) {
  const { writeFileSync } = await import("fs");
  const backup: object[] = [];
  let applied = 0;
  for (const m of mismatches as { question_id: string; slot: number }[]) {
    const rows2 = await sql`SELECT wine_profiles FROM generated_questions WHERE question_id = ${m.question_id}`;
    const profiles = rows2[0]?.wine_profiles as Record<string, unknown> | null;
    const old = profiles?.[String(m.slot)];
    if (!old || (old as { source_method?: string }).source_method !== "bank_lookup") continue;
    backup.push({ question_id: m.question_id, slot: m.slot, profile: old });
    const cleared = {
      bank_match: null,
      tasting_profile: null,
      confidence: "low",
      source_method: "none",
      enriched_at: new Date().toISOString(),
      cleared_reason: "wrong_cuvee_audit_2026_08_05",
    };
    await sql`
      UPDATE generated_questions
      SET wine_profiles = jsonb_set(wine_profiles, ${`{${m.slot}}`}::text[], ${JSON.stringify(cleared)}::jsonb)
      WHERE question_id = ${m.question_id}
    `;
    applied++;
  }
  const backupPath = join(process.cwd(), "..", "data", `wine_profiles_wrong_cuvee_backup_${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`APPLIED: cleared ${applied} slots; backup of replaced profiles at ${backupPath}`);
}
