// rewrite-disclosure-stems.mjs — surgical rewrite of SERVABLE stems that fail R10
// (stem-discloses-discriminator / un-MW asks), preserving everything except the offending phrase.
//
// This is deliberately NOT Phase D regeneration: the flights, keys, marks and model answers of these
// questions are fine — only a phrase in the stem is un-MW ("comment on the role of oak and lees",
// "wines are from different quality levels"). Regenerating the whole question would discard good
// wines and spend a full generation+answer+enrichment cycle per question; this rewrites the sentence.
//
// Safety is deterministic, not vibes: a rewrite is accepted ONLY if
//   1. stemDisclosureViolations() is clean on the result,
//   2. the multiset of printed mark tokens ("(10 marks)", "(2 x 8 marks)") is IDENTICAL — so the
//      mark-allocation invariant (25/wine) survives byte-for-byte,
//   3. the sub-part letters (a/b/c…) are identical in order — the stored model answer keys on them,
//   4. the wine-number references resolve to the same slot set,
//   5. the stem stays within ±25% of its original length.
// Anything else → retry (2x), then skip with a report. Binned/quarantined rows are excluded — they
// never serve, and Mike already rejected them wholesale.
//
//   node scripts/rewrite-disclosure-stems.mjs            (dry run: rewrite + verify, no writes)
//   node scripts/rewrite-disclosure-stems.mjs --apply    (write question_text)
//
// After --apply, rebuild the answer keys (the stem feeds key validation + drill scoring):
//   node scripts/build-stem-answer-keys.mjs

import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";
import { stemDisclosureViolations } from "../src/lib/question-rules.mjs";
import { mentionedWineSlots } from "../src/lib/answer-content-rules.mjs";

const envLocal = (key) => {
  try {
    return readFileSync(".env.local", "utf8").match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n\\r]+)"?`, "m"))?.[1]?.trim();
  } catch {
    return undefined;
  }
};
const DB = process.env.DATABASE_URL || envLocal("DATABASE_URL");
const API_KEY = process.env.ANTHROPIC_API_KEY || envLocal("ANTHROPIC_API_KEY");
if (!DB || !API_KEY) throw new Error("DATABASE_URL and ANTHROPIC_API_KEY required");
const sql = neon(DB);
const client = new Anthropic({ apiKey: API_KEY });
const apply = process.argv.includes("--apply");

const markTokens = (s) => [...(s || "").matchAll(/\(\s*\d+(?:\s*[x×]\s*\d+)?\s*marks?\s*\)/gi)].map((m) => m[0].replace(/\s+/g, "")).sort();
const subLetters = (s) => [...(s || "").matchAll(/(?:^|\n)\s*\(?([a-f])\)\s+/g)].map((m) => m[1]);

function verify(oldStem, newStem, wineCount) {
  if (stemDisclosureViolations(newStem).length > 0) return "still fails R10";
  if (JSON.stringify(markTokens(oldStem)) !== JSON.stringify(markTokens(newStem))) return "mark tokens changed";
  if (subLetters(oldStem).join("") !== subLetters(newStem).join("")) return "sub-part letters changed";
  const oldSlots = [...mentionedWineSlots(oldStem, wineCount)].sort().join(",");
  const newSlots = [...mentionedWineSlots(newStem, wineCount)].sort().join(",");
  if (oldSlots !== newSlots) return `wine references changed (${oldSlots} -> ${newSlots})`;
  const ratio = newStem.length / Math.max(1, oldStem.length);
  if (ratio < 0.6 || ratio > 1.25) return `length drifted (${Math.round(ratio * 100)}%)`;
  return null;
}

async function rewrite(stem, violationDetail) {
  const msg = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1200,
    system: `You edit Master of Wine practical exam stems. You make the SMALLEST possible edit that removes an un-MW phrasing, and change nothing else.

Rules (violating any = your output is discarded by a verifier):
- Remove or reword ONLY the offending phrase. Every other word stays as-is.
- The exam never announces what the candidate should discern: no "made using different/contrasting approaches", no announcing quality-tier differences, no naming mechanism PAIRS ("the role of oak and lees"). Reword to the neutral exam register: "Comment on the key winemaking decisions evident in the wine", "Comment on the method of production", "Comment on the style and quality", or a SINGLE topic ("the role of oak") when one topic is clearly central.
- Keep every printed mark value EXACTLY as-is: every "(N marks)" and "(N x M marks)" token must survive unchanged.
- Keep the sub-part letters a)/b)/c) and their order unchanged.
- Keep all wine-number references ("Wines 1 and 2", "Wines 1-4") unchanged.
- Do not add information about the wines. Do not change constraint sentences that are exam-authentic ("from four different countries", "same single grape variety", "different methods of production").

Output ONLY the rewritten stem, no preamble, no fences.`,
    messages: [
      {
        role: "user",
        content: `The validator flagged this stem:\nVIOLATION: ${violationDetail}\n\nSTEM:\n${stem}`,
      },
    ],
  });
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

const rows = await sql`
  SELECT question_id, paper, question_text, wines
  FROM generated_questions
  WHERE review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE
    AND (metadata->>'archived') IS DISTINCT FROM 'true'`;

let flagged = 0,
  rewritten = 0,
  skipped = 0;
for (const r of rows) {
  const v = stemDisclosureViolations(r.question_text || "");
  if (v.length === 0) continue;
  flagged++;
  const wineCount = (typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines)?.length ?? 0;
  let ok = null,
    reason = null;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    const candidate = await rewrite(r.question_text, v[0].detail);
    reason = verify(r.question_text, candidate, wineCount);
    if (!reason) ok = candidate;
    else console.log(`  ${r.question_id} attempt ${attempt + 1} rejected: ${reason}`);
  }
  if (!ok) {
    skipped++;
    console.log(`SKIP ${r.question_id} — no verified rewrite (${reason})`);
    continue;
  }
  rewritten++;
  console.log(`──── ${r.question_id} (P${r.paper})`);
  console.log(`  was: ${r.question_text.replace(/\n+/g, " / ").slice(0, 180)}`);
  console.log(`  now: ${ok.replace(/\n+/g, " / ").slice(0, 180)}`);
  if (apply) {
    await sql`UPDATE generated_questions SET question_text = ${ok} WHERE question_id = ${r.question_id}`;
  }
}
console.log(`\nflagged servable stems: ${flagged} · rewritten: ${rewritten} · skipped: ${skipped}${apply ? " (written)" : " (dry run)"}`);
