# Question-Quality Remediation Plan (Stem Sniper + generation root cause)

**Problem.** Generated questions reach users still wrong (e.g. a "four different countries" stem
whose four wines are Pinot Noir from Australia / Oregon / California / France — only **3** distinct
countries, two USA). The generation "validators" are *prompt instructions to the LLM*, not enforced
post-generation gates, so bad questions slip through. Stem Sniper exposes this starkly (stem-only
drilling), and feedback currently **cannot fix the root cause** because Stem-Sniper feedback was
isolated to Stem-Sniper files.

**Goal.** Every question served (Stem Sniper *and* the main study flow — they share the
`generated_questions` table) is validity-checked and correct; bad questions are caught *before*
serving; and user feedback can alter **question generation** and **the validators**, not just answer
keys — safely.

---

## Ground truth & conventions for the implementing agent (read first)

- **Repo root:** `C:/Users/russe/Documents/MW_exam`. **App:** `study-app/` (this is the Next.js root;
  Vercel Root Directory = `study-app`). `study-app/AGENTS.md` warns this is a *modified* Next.js — read
  `study-app/node_modules/next/dist/docs/` before writing route/handler code.
- **Run DB/node scripts from `study-app/`** (so `@neondatabase/serverless` resolves) OR pass absolute
  paths. `.env.local` (in `study-app/`) has **`DATABASE_URL`** and **`ANTHROPIC_API_KEY`** but **no
  `GITHUB_TOKEN`** — so the *app* can't fire the dispatch locally; test dispatches with `gh api` or in prod.
- **Auto-Apply is ON** (`app_settings.auto_apply_enabled = true`). Kill switch: `AUTO_APPLY_HARD_DISABLE=1`.
- **Node 24 strips TS types** — `.mjs` test scripts can `import` a `.ts` lib directly.
- **Deploy:** git auto-deploy is disabled (`study-app/vercel.json` `git.deploymentEnabled:false`);
  `auto-feedback.yml` deploys via explicit `vercel --prod`; manual deploy = `npx vercel --prod --yes`
  from the **repo root**.
- **Never modify** `source/MW_Practical_Papers_Compilation.md`, `data/exams.json`, `data/wines.json`.
- **Schemas:**
  - `generated_questions(question_id PK, paper, family, family_label, subcategory, question_text,
    wines jsonb [{slot, fullText, appearance?}], total_marks, model_answer, wine_profiles jsonb (keyed
    by slot string), metadata, reasoning_trace, created_at)`
  - `stem_answer_keys(question_id PK, ground_truth jsonb [{slot, varieties[], region, country,
    is_blend, style?, style_category?, style_tokens?}], plausible jsonb, source jsonb, validated bool,
    generated_at)`
- **Families:** F1 Same Variety · F2 Same Origin · F3 Blend Logic · F4 Mixed Breadth · F5
  Method/Production · F6 Style Mechanism · F7 Quality Hierarchy.

### Verification standard (applies to EVERY step)
After each step the implementing agent MUST:
1. `cd study-app && npx tsc --noEmit` → exit 0 (if TS changed).
2. `npm run build` → exit 0 (if app code changed).
3. Run the step's `scripts/test-*.mjs` → all pass.
4. Run the step's **DB state check** → matches expectation.
5. Run the step's **Agentic verification** (a subagent reviews real data against the goal) and record the
   verdict. Do **not** advance to the next step until the agentic check passes.
6. Commit with a focused message; push only when the step's gate is green.

A change is only "done" when it provably produces **correct questions + correct answers for the user** —
verified on real rows, not just compiling.

---

## ⚠ Open carry-forwards (MUST be closed before the program is "done")

Track these here and tick them off; do not consider the program complete while any is open.

- **CF-1 — The main study flow has NO validity gate.** Phase A quarantines via
  `stem_answer_keys.validated=false`, which only governs **Stem Sniper**. The 6 HARD-invalid
  questions (and any future ones) are **still served by the main study flow** (`get-question` and
  any path that returns an existing `generated_questions` row). **Closed by:** Phase **B0** (flag
  invalid rows on `generated_questions` itself + a serving-time guard shared by both flows) **and**
  Phase **D** (regenerate the 6 so the corpus recovers). Until B0 + D are done, a user can still hit
  these 6 in the main flow. **☑ B0 — DONE + DEPLOYED (commit f8c958f).** The 6 are flagged on
  `generated_questions` and excluded by every main-flow fetcher + the serve-time bank filter
  (verified: 49 total → 43 serveable, 0 of the 6 ever served, local + prod). **◑ D — 4/7 replaced
  (2026-05-30); 3 remain hidden, blocked on Anthropic API credits.** The 4 regenerated questions are
  live + agentically verified (incl. a bonus false-key fix: Catena White Stones Chardonnay was mis-keyed
  Malbec via a fuzzy bank match — resolver now guards against label conflicts). Re-run
  `remediate-questions.mjs --apply` once credits are restored to replace the last 3 and reach 0 HARD.
- **CF-2 — Answer-key/builder auto-fixes are inert until the keys rebuild.** ✅ **CLOSED (df7939f).**
  `auto-feedback.yml` now has a post-merge "Rebuild keys + re-audit" step: runs
  `build-stem-answer-keys.mjs` when stem data/builder files changed, and `audit-questions.mjs --apply`
  when validator/generation files changed (scripts now read `DATABASE_URL` from env in CI). ☑
- **CF-3 — auto-applied feedback changes shipped unreviewed.** ✅ **Addressed going forward (df7939f).**
  Kind routing now PR-gates ALL generation/validator changes (reviewOnly) — proven live (PR #2 opened,
  not merged). ☑ for new changes. ☐ Still to do: review the *existing* two prior auto-changes
  (curated-confusables + origin-diversity in `build-stem-answer-keys.mjs`) for correctness.

---

## Phase A — Audit the existing corpus & quarantine the broken ones (stop the bleeding)

> **STATUS: ✅ DONE (2026-05-30, commit `3aa6327`).** Built `question-validator.ts` + `audit-questions.mjs`
> + 13 unit tests. Audit found **6/47 (13%) HARD-invalid**, all quarantined (`validated=false` +
> `invalid_reasons`): gen_p1_F1 (same-variety + a blend), gen_p1_F3 & gen_p2_F1 (country-diversity),
> gen_p2_F1 (same-variety: Syrah+Blaufränkisch), gen_p2_F6 (distinct-variety: two Syrah), gen_p3_F1
> (same-variety: Chenin+Furmint+Savagnin). First pass had a 50% false-positive rate (subset/pair stems,
> "predominantly", co-ferments) — hardened the validator (skip subset-split stems, soft single-variety-
> blend, punctuation-insensitive) to **0 false positives**, confirmed by an independent verification agent
> (6 invalid ✓ / 3 control valid ✓). Pool: 41 validated / 6 quarantined.
> ⚠ These 6 are still served by the **main study flow** (no validated gate there) → tracked as **CF-1**
> (see Open carry-forwards above); closed by Phase **B0** (serving guard) + Phase **D** (regenerate).

**Outcome:** a shared validator lib + an audit that flags every mechanical validity contradiction across
all `generated_questions`, and quarantines violators so Stem Sniper stops serving them.

### A1. Shared validator lib `study-app/src/lib/question-validator.ts`
Pure, no I/O — reused by the audit (A), the generation gate (B), and the workflow (C).

```ts
// study-app/src/lib/question-validator.ts
export interface AuditWine { slot: number; varieties: string[]; region: string; country?: string; is_blend?: boolean; style?: string; }
export interface QuestionForAudit { questionId: string; paper: number; family: string; questionText: string; totalMarks?: number; wines: AuditWine[]; }
export interface Violation { rule: string; severity: "hard" | "soft"; detail: string; }

const NUM: Record<string, number> = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12 };
const norm = (s?: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function validateQuestion(q: QuestionForAudit): { ok: boolean; violations: Violation[] } {
  const v: Violation[] = [];
  const stem = norm(q.questionText);
  const primaries = q.wines.map((w) => norm(w.varieties?.[0]));
  const distinctPrimary = new Set(primaries.filter(Boolean));
  const distinctCountry = new Set(q.wines.map((w) => norm(w.country)).filter(Boolean));

  // R1 — "N different countries" must be backed by N distinct keyed countries
  const cc = stem.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s+(?:different\s+)?countries\b/);
  if (cc) {
    const n = /^\d+$/.test(cc[1]) ? Number(cc[1]) : NUM[cc[1]];
    if (n && distinctCountry.size < n)
      v.push({ rule: "country-count", severity: "hard", detail: `stem promises ${n} different countries; key has ${distinctCountry.size} distinct (${[...distinctCountry].join(", ")})` });
  }
  // R2 — "same single grape variety" ⇒ one primary variety across the flight
  if (/\bsame single grape variety\b|\bsame grape variety\b|\bsame variety\b/.test(stem) && distinctPrimary.size > 1)
    v.push({ rule: "same-variety", severity: "hard", detail: `stem says same variety; key has ${distinctPrimary.size}: ${[...distinctPrimary].join(", ")}` });
  // R3 — "different ... grape varieties" ⇒ all primaries distinct
  if (/different (?:single )?grape variet(?:y|ies)|each .*different.*variety/.test(stem) && primaries.filter(Boolean).length !== distinctPrimary.size)
    v.push({ rule: "distinct-variety", severity: "hard", detail: `stem says different varieties; duplicates present (${primaries.join(", ")})` });
  // R4 — "same country" ⇒ one country
  if (/\bsame country\b/.test(stem) && distinctCountry.size > 1)
    v.push({ rule: "same-country", severity: "hard", detail: `stem says same country; key has ${[...distinctCountry].join(", ")}` });
  // R5 — "single grape variety" ⇒ no blend wine in the flight
  if (/\bsingle grape variety\b/.test(stem) && q.wines.some((w) => w.is_blend))
    v.push({ rule: "single-variety-blend", severity: "hard", detail: `stem says single grape variety; a wine is a blend` });
  // R6 — marks: 25 per wine (universal MW rule)
  if (q.totalMarks && q.wines.length && q.totalMarks !== q.wines.length * 25)
    v.push({ rule: "marks", severity: "soft", detail: `total_marks ${q.totalMarks} != ${q.wines.length}×25` });

  return { ok: v.some((x) => x.severity === "hard") ? false : true, violations: v };
}
```

### A2. Migration — record why a key was quarantined
```js
// add to study-app/scripts/build-stem-answer-keys.mjs migrate() AND run once:
await sql`ALTER TABLE stem_answer_keys ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
```

### A3. Auditor `study-app/scripts/audit-questions.mjs` (read → report → quarantine)
```js
import { readFileSync } from "fs"; import { neon } from "@neondatabase/serverless";
import { validateQuestion } from "../src/lib/question-validator.ts"; // Node 24 strips types
const sql = neon(readFileSync(".env.local","utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim());
const rows = await sql`
  SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, k.ground_truth
  FROM generated_questions g JOIN stem_answer_keys k ON k.question_id = g.question_id`;
let flagged = 0; const apply = process.argv.includes("--apply");
for (const r of rows) {
  const gt = typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth;
  const res = validateQuestion({ questionId:r.question_id, paper:r.paper, family:r.family, questionText:r.question_text, totalMarks:r.total_marks, wines:gt });
  const hard = res.violations.filter(x=>x.severity==="hard");
  if (res.violations.length) { console.log(`${res.ok?"soft":"HARD"} ${r.question_id} (P${r.paper} ${r.family}): ${res.violations.map(x=>x.rule).join(", ")}`); res.violations.forEach(x=>console.log("    - "+x.detail)); }
  if (hard.length) { flagged++; if (apply) await sql`UPDATE stem_answer_keys SET validated=false, invalid_reasons=${JSON.stringify(hard)}::jsonb WHERE question_id=${r.question_id}`; }
}
console.log(`\n${flagged}/${rows.length} have HARD violations.${apply?" Quarantined (validated=false).":" (dry run — pass --apply to quarantine)"}`);
```
Run dry first: `node scripts/audit-questions.mjs` → then `node scripts/audit-questions.mjs --apply`.

### A4. Test `study-app/scripts/test-question-validator.mjs`
```js
import { validateQuestion } from "../src/lib/question-validator.ts";
let p=0,f=0; const ok=(n,c)=>c?p++:(f++,console.log("FAIL",n));
ok("4 countries / 3 distinct = hard", !validateQuestion({questionId:"x",paper:2,family:"F1",questionText:"... four different countries ...",wines:[{slot:1,varieties:["Pinot Noir"],region:"a",country:"USA"},{slot:2,varieties:["Pinot Noir"],region:"b",country:"USA"},{slot:3,varieties:["Pinot Noir"],region:"c",country:"France"},{slot:4,varieties:["Pinot Noir"],region:"d",country:"Australia"}]}).ok);
ok("same variety / 2 grapes = hard", !validateQuestion({questionId:"x",paper:1,family:"F1",questionText:"same single grape variety",wines:[{slot:1,varieties:["Riesling"],region:"a",country:"DE"},{slot:2,varieties:["Chardonnay"],region:"b",country:"FR"}]}).ok);
ok("clean question passes", validateQuestion({questionId:"x",paper:2,family:"F1",questionText:"four different countries",wines:[{slot:1,varieties:["Syrah"],region:"a",country:"FR"},{slot:2,varieties:["Syrah"],region:"b",country:"AU"},{slot:3,varieties:["Syrah"],region:"c",country:"US"},{slot:4,varieties:["Syrah"],region:"d",country:"ZA"}]}).ok);
console.log(`question-validator: ${p} passed, ${f} failed`); process.exit(f?1:0);
```

### ✅ Verification — Phase A
- `npx tsc --noEmit` (validator lib) → 0; `node scripts/test-question-validator.mjs` → all pass.
- `node scripts/audit-questions.mjs` (dry) → prints the flagged list + count.
- DB check after `--apply`:
  ```sql
  SELECT validated, COUNT(*) FROM stem_answer_keys GROUP BY validated;     -- some now false
  SELECT question_id, invalid_reasons FROM stem_answer_keys WHERE validated=false;
  ```
- Live: `GET /api/stem-sniper/next` (loop ~15×) never returns a quarantined `question_id`.
- **Agentic verification:** spawn an agent (general-purpose / `question-analyst`) — *"Here are 5 questions the auditor flagged HARD and 3 it passed. For each, read the stem and the wines and confirm independently whether the stem genuinely contradicts the wines. Report any FALSE POSITIVE (a clean question wrongly flagged) or FALSE NEGATIVE (an obviously broken question that passed)."* Gate: 0 false positives among the 5 flagged; if a clean question was quarantined, fix the rule before A is "done".
- **Definition of done:** every quarantined question is genuinely broken; Stem Sniper's served pool contains no HARD-violation question.

---

## Phase B — Hard validator as a GENERATION GATE (root-cause fix)

> **STATUS: ✅ DONE + DEPLOYED (2026-05-30, commit `f8c958f`).** Closed CF-1 (B0: row-level
> `invalid_reasons` flag + main-flow fetcher guards + serve-time country-diversity in the bank filter)
> and added a FINAL SELF-CHECK to the generation prompt. **Deviation (recorded in the commit):** the
> accurate Phase-A `validateQuestion` can't run at fresh-gen time in prod (the `data/` lexicons aren't
> in the function bundle; profiles enrich async), so the persistent flag comes from the *audit* (script,
> has data access) and runtime uses the existing pure fullText validators — country-diversity is now
> enforced at serve time AND (already) never-relaxed in fresh gen. The audit is the comprehensive
> backstop, to be auto-run by Phase C3. Verified: build green; 49 total → 43 serveable; live get-question
> P1/P2/P3 = 200 with none of the 6; deployed (root + /stem-sniper = 200).
>
> **Not covered by B (honest):** a *fresh* same-variety / distinct-variety bug with detection gaps in the
> pure validators could still pass at gen time — caught only by the accurate audit running later (Phase C3
> auto-run, or a manual `audit-questions.mjs --apply`). Country-diversity (the demonstrated bug) IS fully gated.

**Outcome:** new questions are validated programmatically *before* being stored/served; failures are
regenerated or rejected. The validator lib from A is the single source of truth. **And the main study
flow stops serving the already-flagged invalid questions (closes CF-1).**

### B0. Close CF-1 — protect the MAIN study flow, not just Stem Sniper
The audit currently writes `stem_answer_keys.validated=false`, which only the Stem Sniper `next` route
honours. The main study flow reads `generated_questions` directly, so it still serves the 6. Fix by
flagging the row itself and guarding every serving path:

1. Migration + auditor: flag `generated_questions` too.
```js
// migration (run once):
await sql`ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
// in audit-questions.mjs --apply, alongside the stem_answer_keys update:
await sql`UPDATE generated_questions SET invalid_reasons = ${JSON.stringify(hard)}::jsonb WHERE question_id = ${r.question_id}`;
// (and clear it when a question passes: SET invalid_reasons = NULL where ok)
```
2. Serving guard: every query that returns an EXISTING `generated_questions` row to a user must exclude
   flagged rows. Audit the serving paths (`get-question`, `getUnansweredQuestions`/`getQuestionsByFilter`/
   `getRecentGeneratedQuestions` in `db.ts`, `question-counts`, `history` only counts past attempts so it's
   exempt) and add `AND invalid_reasons IS NULL`:
```ts
// e.g. in db.ts getQuestionsByFilter / getUnansweredQuestions:
//   ... WHERE paper = ${paper} AND (invalid_reasons IS NULL) ...
```
3. **Verification (CF-1):** none of the 6 quarantined `question_id`s is returned by `get-question` or any
   main-flow fetch; pool counts drop by exactly the flagged count; Stem Sniper unaffected.

### B1. A DB-free audit shape from a freshly generated question
The generator produces `wines:[{slot,fullText}]` + `wine_profiles`. Build the `AuditWine[]` from
`wine_profiles.grape_varieties` + an origin parse (reuse the resolver in `build-stem-answer-keys.mjs` —
extract `resolveVariety`/`resolveOrigin` into a shared `study-app/src/lib/wine-resolve.ts` so generation
and the key builder share one implementation; refactor, keep behaviour identical, re-run the stem-scoring
+ key-build tests to prove no regression).

### B2. Gate in the generation route (`get-question` / `generate-tasting`)
After generation + `enrichWineProfiles`, before persisting/returning:
```ts
import { validateQuestion } from "@/lib/question-validator";
import { toAuditWines } from "@/lib/wine-resolve"; // builds AuditWine[] from wines + wine_profiles

const audit = validateQuestion({ questionId, paper, family, questionText, totalMarks, wines: toAuditWines(wines, wineProfiles, paper) });
if (!audit.ok) {
  console.warn(`[gen-gate] ${questionId} failed validation:`, audit.violations.map(v=>v.rule));
  if (attempt < MAX_REGEN) continue;            // regenerate (loop) — preferred
  return Response.json({ error: "Could not generate a valid question", violations: audit.violations }, { status: 422 });
}
```

### B3. Strengthen the generation prompt (`question-generation-prompt.ts`)
Add a final hard self-check block listing the exact failing patterns + an explicit "before you output,
verify and FIX" instruction (the rules exist but are violated; make compliance the last step):
```
## FINAL SELF-CHECK (do this before output; fix any failure, output the corrected version)
- If the stem says "N different countries": list each wine's country; they MUST be N distinct countries.
- If "same single grape variety": every wine's dominant grape MUST be identical.
- If "different grape varieties": every wine's dominant grape MUST be distinct.
- "single grape variety" ⇒ NO blend wines. Marks MUST total 25 per wine.
Output ONLY the corrected, self-consistent question.
```

### ✅ Verification — Phase B
- `npx tsc --noEmit` + `npm run build` → 0; existing `test-stem-scoring.mjs` + key-build still pass
  (proves the `wine-resolve` refactor didn't regress).
- Generate **10** fresh questions through the gated route; run `validateQuestion` on each → **0 hard
  violations** (compare to the corpus's pre-gate violation rate from A).
- **Agentic verification:** spawn an agent — *"Generate 10 questions via the gated pipeline. For each,
  confirm (a) it passes the hard validator, and (b) it reads as a coherent, answerable MW exam question
  whose stem matches its wines. Flag any that are technically valid but pedagogically broken."* Gate:
  10/10 pass the validator AND read as coherent.
- **Definition of done:** a deliberately-broken generation (force a 4-countries/3-distinct case) is
  rejected/regenerated by the gate, never returned; **AND (CF-1) the 6 already-flagged questions are no
  longer returned by the main study flow** (B0 guard verified). Tick CF-1 ☐ B0 in the carry-forwards.

---

## Phase C — Re-scope feedback by *Kind* so it can fix generation & validators (safely)

> **STATUS: ✅ DONE + DEPLOYED (2026-05-30, commit `df7939f`).** Every analysis now emits `Kind:
> answer-key | question | generation | validator`; Stem-Sniper feedback can escalate (the old
> "stay scoped" restriction removed). `apply-change` routes: question → direct DB quarantine (no
> Action); answer-key → auto + scoped; generation/validator → scoped **+ reviewOnly (PR-gated)**.
> CF-3 ☑ (reviewed 2026-05-30 — both prior auto-changes correct: the curated-confusables only adds
> PLAUSIBLE scoring buckets for ABC Hildegard's California-Chardonnay trap and can't invalidate a
> question; the origin-diversity check is byte-for-byte the same logic as question-validator R1).
> CF-2 closed: post-merge "Rebuild keys + re-audit" step. Verified: build green; YAML gates wired;
> 4-Kind prompt + routing regex tested; **live reviewOnly test — a generation-kind change was
> verified + in-scope but PR-gated (PR #2 opened, master untouched, merge/deploy skipped).** Note:
> the key-rebuild + question-quarantine paths are wired + statically verified; they exercise on the
> next real answer-key merge / question-kind feedback.

**Outcome:** feedback is classified and routed: answer-key/question fixes auto-apply (low risk);
generation/validator fixes reach the right files but are **PR-gated** (human review). Plus the
**key-rebuild gap is closed** so answer-key fixes actually take effect.

### C1. Classify Kind in `buildFeedbackAnalysisPrompt`
Generalize the existing stem-sniper branch to require one of four:
```
End with: Kind: answer-key | question | generation | validator
- answer-key : the Stem Sniper answer-key data is wrong (variety/style/region/plausible/tier).
- question   : THIS specific generated question is invalid (stem contradicts its wines). Fix or quarantine it.
- generation : the generation pipeline produces a class of bad questions — propose a prompt/logic change.
- validator  : a bad question PASSED validation — propose a stronger check in question-validator.ts.
```

### C2. Route by Kind in `apply-change.ts`
```ts
const kind = (analysisText.match(/Kind:\s*(answer-key|question|generation|validator)/i)?.[1] || "answer-key").toLowerCase();
const STEM = ["study-app/src/app/stem-sniper/","study-app/src/app/components/StemSniper","study-app/src/app/api/stem-sniper/","study-app/src/lib/stem-scoring.ts","study-app/scripts/build-stem-","data/variety_lexicon.json","data/appellation_varieties.json","data/stem_proprietary_blends.json","data/stem_style_lexicon.json"];
const GEN = ["study-app/src/lib/prompts/question-generation-prompt.ts","study-app/src/lib/wine-enrichment.ts","study-app/src/lib/wine-bank-lookup.ts","study-app/src/app/api/get-question/","study-app/src/app/api/generate-tasting/","data/mock_wine_bank.json"];
const VALIDATOR = ["study-app/src/lib/question-validator.ts","study-app/src/lib/wine-resolve.ts","study-app/src/lib/prompts/question-generation-prompt.ts"];
const ROUTE = {
  "answer-key": { allowedPaths: STEM,      reviewOnly: false },
  "question":   { allowedPaths: STEM,      reviewOnly: false }, // quarantine/fix the one question
  "generation": { allowedPaths: GEN,       reviewOnly: true  }, // PR-gated: high-stakes pipeline change
  "validator":  { allowedPaths: VALIDATOR, reviewOnly: true  },
}[kind];
await dispatchAutoFeedback({ ...payload, allowedPaths: ROUTE.allowedPaths.join("\n"), reviewOnly: String(ROUTE.reviewOnly) });
```
(Add `reviewOnly?: string` to `AutoFeedbackPayload` in `github-dispatch.ts`.)

### C3. Workflow `auto-feedback.yml` — honor reviewOnly + rebuild keys + re-audit
```yaml
      ALLOWED_PATHS: ${{ github.event.client_payload.allowedPaths }}
      REVIEW_ONLY:   ${{ github.event.client_payload.reviewOnly }}
```
- Gate merge: `if: ... && steps.scope.outputs.out_of_scope != '1' && env.REVIEW_ONLY != 'true'`
- PR step fires when `out_of_scope == '1' OR env.REVIEW_ONLY == 'true'` (reason: "high-stakes
  generation/validator change — review before merge").
- **After a verified merge**, rebuild keys + re-audit when the touched files imply it:
```yaml
      - name: Rebuild + re-audit (stem data/builder or generation changed)
        if: steps.merge.outputs.merged == '1'
        working-directory: ${{ env.APP_DIR }}
        run: |
          CHANGED=$(git diff --name-only HEAD^ HEAD)
          if echo "$CHANGED" | grep -qE 'stem_(proprietary_blends|style_lexicon)|variety_lexicon|appellation_varieties|build-stem-answer-keys'; then
            echo "Rebuilding stem_answer_keys…"; node scripts/build-stem-answer-keys.mjs
          fi
          if echo "$CHANGED" | grep -qE 'question-validator|wine-resolve|question-generation-prompt'; then
            echo "Re-auditing corpus…"; node scripts/audit-questions.mjs --apply
          fi
```

### ✅ Verification — Phase C
- `tsc`/`build` 0; unit-test the Kind→route mapping (a tiny `.mjs` asserting allowedPaths/reviewOnly per kind).
- **Live (use `gh api` to craft dispatches, as in Phase 5):**
  - `Kind: generation` change (touches `GEN` files) → run is **PR-gated, NOT merged**, master untouched.
  - `Kind: answer-key` change (touches `data/stem_*`) → merges, **and the rebuild step runs** → confirm the
    target `stem_answer_keys` row actually changed in Neon (the inert-fix gap is closed).
  - `Kind: question` → the specific question is quarantined (validated=false).
- **Agentic verification:** *"Submit (a) a real generation complaint and (b) a real answer-key complaint
  through the live feedback path. Confirm (a) becomes a PR touching only generation files and (b)
  auto-applies + the key visibly changes in the DB. Confirm neither edits an unrelated feature."*
- **Definition of done:** feedback can alter generation + validators (PR-gated) and answer keys (auto +
  rebuilt); nothing high-stakes auto-merges; isolation still holds (scope guard green).

---

## Phase D — Remediate the corpus (clean + full)

> **STATUS: ⏳ MOSTLY DONE — 4/7 replaced, 3 blocked on Anthropic API credits (2026-05-30).**
> Built `remediate-questions.mjs` (+ `ts-loader.mjs` so Node can run the app's `.ts` libs with their
> extensionless imports) and refactored `build-stem-answer-keys.mjs` to export a reusable
> `buildKeyForRow`/`upsertKey` and **skip `metadata.archived` rows** (audit too). The remediation loop
> regenerates a same-paper×family question via the real pipeline (`buildQuestionGenerationPrompt` →
> Opus/Sonnet → enrich → key build), gates on **`validateQuestion(...).ok && key.validated`** (the
> accurate validator against the resolved key), retries to MAX 6, writes a model answer, and archives
> the old row. **4/7 regenerated valid + verified:** gen_p1_F1→Riesling flight, gen_p1_F3→4-country/
> 4-variety whites, gen_p2_F1→Malbec (Mendoza/Cahors), gen_p2_F1→Pinot Noir (Alsace/Otago/Willamette).
> Agentic check: **4/4 fully correct** (stem↔wines coherent, keys factually correct).
>
> **Bonus root-cause fix (key correctness):** verification caught a *false answer key* — Catena
> "White Stones **Chardonnay**" was keyed **Malbec** because the enrichment bank-lookup fuzzy-matched
> it to that producer's Malbec entry, and the key builder trusted `bank_match` over the explicit grape
> on the label. Added a **label-conflict guard** to `resolveVariety` (reject a bank/profile variety that
> contradicts an explicit grape named on the label) **and** to the §2b consistency check. Blast radius =
> **exactly 1 key** (the fix); 0 regressions; 13 validator + 17 stem-scoring tests still pass.
>
> **Blocked (do this when credits are topped up):** the run hit
> `invalid_request_error: credit balance too low` partway through, so 3 remain quarantined (and hidden
> from both flows): **gen_p2_F6** (P2, distinct-variety HARD), **gen_p3_F1** (P3, same-variety HARD), and
> **gen_p2_F3** (P2, Stem-Sniper key-resolution gap — *not* HARD, still safely served by the main flow
> as it has a model answer). To finish: top up the Anthropic key, then from `study-app/`:
> `node --import ./scripts/ts-loader.mjs scripts/remediate-questions.mjs --apply`
> (it auto-targets `validated=false AND NOT archived` — exactly those 3), then
> `node scripts/build-stem-answer-keys.mjs && node scripts/audit-questions.mjs --apply` → expect **0 HARD**.
> No deploy needed — these are DB-content + script changes; the Vercel bundle is unaffected.

**Outcome:** every quarantined question is regenerated through the hardened (Phase B) pipeline until it
passes; the corpus has 0 hard violations and the Stem Sniper pool is restored. **This fully closes CF-1**
— the 6 invalid questions are replaced by valid ones, so neither Stem Sniper nor the main study flow can
serve them. (B0 stops serving them; D replaces them.)

### D1. `study-app/scripts/remediate-questions.mjs`
```js
// For each quarantined question, regenerate same paper×family via the gated pipeline until valid,
// rebuild its key, and verify. Archive the old row (do not silently overwrite history).
const bad = await sql`SELECT g.* FROM generated_questions g JOIN stem_answer_keys k USING (question_id) WHERE k.validated=false`;
for (const q of bad) {
  // call the same generation path as get-question (extract a callable generateValidatedQuestion(paper, family))
  // → persist new question_id, build its stem_answer_key, assert validateQuestion(...).ok && key.validated
  // → mark the old question_id archived (metadata.archived=true) so it leaves the pool
}
```
(Prefer regeneration over hand-editing; the Phase-B gate guarantees the replacement is valid.)

### D2 / D3. Rebuild keys for the new questions; final corpus audit.

### ✅ Verification — Phase D
- `node scripts/audit-questions.mjs` → **0 HARD violations** across the corpus.
- DB: `SELECT COUNT(*) FILTER (WHERE validated) AS live, COUNT(*) AS total FROM stem_answer_keys;` →
  `live` restored to ~`total` (pool full again).
- Live: do 10 Stem Sniper drills across P1/P2/P3 — every stem matches its wines; answers correct.
- **Agentic verification:** *"Pull 5 regenerated questions. For each, confirm the stem is self-consistent
  with the wines AND that the answer key (variety/style/region) is correct for those exact wines. Report
  any remaining mismatch."* Gate: 5/5 coherent + correct.
- **Definition of done:** a user drilling Stem Sniper (or using the main flow) gets only valid questions
  with correct answers; the original "4 countries / 2 USA"-class bug is impossible to serve.

---

## Acceptance (whole program)
1. **No invalid question can be served** — the hard validator gates generation (B) and the corpus is
   clean (A + D).
2. **Feedback fixes the root cause** — generation + validator changes are reachable (PR-gated) and
   answer-key fixes auto-apply *and take effect* (key rebuild) (C).
3. **Isolation preserved** — every change is scope-guarded; high-stakes changes are human-reviewed.
4. **Proven on real data + agentically verified** at each stage — correct questions, correct answers,
   positive user experience.

## Suggested order
A (measure + stop the bleeding) → B (root-cause gate) → C (feedback reaches the root) → D (clean the
corpus). A and B are the highest value; do them first.
