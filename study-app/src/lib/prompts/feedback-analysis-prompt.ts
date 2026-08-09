import { readFileSync } from "fs";
import { join } from "path";
import { MARKING_PRINCIPLES } from "./marking-principles";
import { personaBlock, type PersonaId } from "../personas";
// Shared with the batch adjudicator (wine-role-rulings.ts) so a role dispute filed WITH a rejection
// and one filed with an approve cannot be ruled on by two different sets of rules.
import { roleDisputeBlock, type RoleDisputeForPrompt } from "./role-adjudication";

interface ThreadMessage {
  role: "system" | "user";
  content: string;
  timestamp: string;
}

/**
 * Coerce user_attempts.tasting_notes into a clean string[].
 *
 * The column is TEXT[] and the neon driver returns an array, but rows written by older paths can
 * hold a JSON-encoded string. Rendering that unparsed would put one quoted blob in the prompt where
 * the per-wine notes belong, so normalise here rather than at each call site.
 */
function normalizeTastingNotes(raw: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : [raw];
    } catch {
      list = [raw];
    }
  }
  return list.filter((n): n is string => typeof n === "string" && n.trim().length > 0);
}

export function buildFeedbackAnalysisPrompt(params: {
  questionText: string;
  wines: { slot: number; fullText: string }[];
  paper: number;
  family: string;
  familyLabel: string;
  modelAnswer: string | null;
  userAnswer: string | null;
  userFeedback: string;
  userName?: string;
  /**
   * The voice the CANDIDATE-FACING half is written in (migration 068). Omitted → the default
   * Tutor, which is what the server-side sweeps and any caller without a user in hand should get.
   */
  persona?: PersonaId | null;
  questionMetadata?: Record<string, unknown> | null;
  previousThread?: ThreadMessage[];
  /** The attempt record — what the system ACTUALLY generated and showed this candidate. Without it
   *  the analysis reasons about the artifact being complained about (the tasting note, the grading)
   *  purely by inference from the model answer. All optional: a feedback left before the candidate
   *  reached a given step simply has nothing there. */
  attempt?: {
    /** TEXT[] from the driver, but a legacy row can hold a JSON string — normalised below. */
    tastingNotes?: unknown;
    preGlassReasoning?: string | null;
    preGlassFeedback?: string | null;
    answerFeedback?: string | null;
    passEstimate?: string | null;
    marksEstimate?: string | null;
    mode?: string | null;
    stemDetail?: string | null;
    stemDetailEscalatedTo?: string | null;
    appVersion?: string | null;
  } | null;
  /** The generator's own reasoning for the MODEL ANSWER (generated_questions.reasoning_trace). */
  reasoningTrace?: string | null;
  /** Live empirical knowledge from the Neon projection (paper-filtered). Falls back to the
   *  build-time digest in pipeline-context.json when not supplied. */
  empiricalKnowledge?: string;
  /**
   * Per-wine banker/curveball claims filed with this rejection (wine_role_rulings rows at 'pending').
   *
   * When present, the analysis adjudicates them INLINE and emits a RoleRuling line for each. That is
   * deliberate rather than lazy: this prompt already carries the flight, the corpus and the empirical
   * knowledge, so a second model call to rule on the same wines would pay ~$1.58 twice to look at the
   * same evidence. A role dispute filed WITHOUT a rejection (a reviewer approving a question but
   * correcting a role) has no analysis to ride on and is batched separately — see
   * adjudicateRoleRulings in wine-role-rulings.ts, which uses the identical contract.
   */
  roleDisputes?: RoleDisputeForPrompt[];
}): { system: string; user: string } {
  // Load ALL historical questions for cross-reference (not just same paper)
  let allQuestions = "";
  let samePaperQuestions = "";
  try {
    const indexPath = join(process.cwd(), "public", "data", "question-index.json");
    const index = JSON.parse(readFileSync(indexPath, "utf-8"));
    const questions = index.questions || [];
    // All questions for broad cross-reference
    allQuestions = questions
      .map((q: { year: number; paper: number; questionNumber: number; text: string; wines?: { slot: number; fullText: string }[] }) => {
        const wineList = (q.wines || []).map((w: { slot: number; fullText: string }) => `  ${w.slot}. ${w.fullText}`).join("\n");
        return `[${q.year} P${q.paper} Q${q.questionNumber}]: ${q.text.slice(0, 300)}${wineList ? "\n  Wines:\n" + wineList : ""}`;
      })
      .join("\n\n");
    // Same paper for focused reference
    const samePaper = questions.filter((q: { paper: number }) => q.paper === params.paper);
    samePaperQuestions = samePaper
      .map((q: { year: number; paper: number; questionNumber: number; text: string; wines?: { slot: number; fullText: string }[] }) => {
        const wineList = (q.wines || []).map((w: { slot: number; fullText: string }) => `  ${w.slot}. ${w.fullText}`).join("\n");
        return `[${q.year} P${q.paper} Q${q.questionNumber}]: ${q.text.slice(0, 300)}${wineList ? "\n  Wines:\n" + wineList : ""}`;
      })
      .join("\n\n");
  } catch {}

  // Load examiner report synthesis and curveball analysis
  let examinerSynthesis = "";
  let curveballAnalysis = "";
  let wineComposition = "";
  // Live empirical knowledge wins; the build-time digest is only a cold fallback (e.g. if the
  // Neon projection is unavailable or hasn't been backfilled yet).
  let empiricalKnowledge = params.empiricalKnowledge || "";
  try {
    const ctxPath = join(process.cwd(), "public", "data", "pipeline-context.json");
    const ctx = JSON.parse(readFileSync(ctxPath, "utf-8"));
    if (ctx.examinerReportSynthesis) examinerSynthesis = ctx.examinerReportSynthesis;
    if (ctx.curveballAnalysis) curveballAnalysis = ctx.curveballAnalysis;
    if (ctx.wineCompositionAnalysis) wineComposition = ctx.wineCompositionAnalysis.slice(0, 3000);
    if (!empiricalKnowledge && ctx.empiricalKnowledgeDigest) empiricalKnowledge = ctx.empiricalKnowledgeDigest;
  } catch {}

  // Per-wine banker/curveball claims filed alongside this rejection. Rendered ONLY when there are
  // any: the block carries the whole calibration plus corpus statistics per claim, and paying that on
  // every analysis to say "no disputes" would be several thousand wasted tokens on the majority of a
  // pass. The section is appended at the END of the internal part, after the Kind line, because its
  // RoleRuling lines are machine-parsed and the analyser has already been told that the last thing it
  // writes is the thing that gets read.
  const disputes = params.roleDisputes ?? [];
  const roleDisputeSection =
    disputes.length === 0
      ? ""
      : `\n\n${roleDisputeBlock(disputes)}\n\nEmit the ${disputes.length} RoleRuling line${disputes.length === 1 ? "" : "s"} as the FINAL thing in your internal section, after the Kind line.`;

  // Does this feedback dispute the AI's EVALUATION / score (as opposed to question design)? If so we
  // inject the exact marking rubric the grader followed so the analysis adjudicates the score against
  // the same rules (plus §2/§3 of the EK above), instead of reasoning about it unaided. Broad on
  // purpose — a false positive only adds the rubric; a miss leaves a scoring dispute ungrounded.
  const isEvaluationDispute = /\b(scor(e|ed|ing)|marks?|marking|grade[ds]?|grading|credit(ed)?|points?|too harsh|too generous|unfair|i was (right|correct)|got it right|should (have|'?ve)|deserved|deduct|under-?(marked|scored|graded)|over-?(marked|scored|graded)|pass(ed)?|fail(ed)?|borderline|harsh|lenient)\b/i.test(params.userFeedback || "");

  // Stem Sniper feedback (tagged "[stem-sniper...]") is usually about the ANSWER KEY for a stem, not
  // the question design. The tag also carries WHICH page it came from so we can frame it precisely.
  const stemTag = (params.userFeedback || "").match(/\[stem-sniper(?::([a-z-]+))?\]/i);
  const isStemSniper = Boolean(stemTag);
  const stemContext = stemTag?.[1] || ""; // "" | stem | reverse-stem | reverse-tasting | result | reverse-result
  const pageNote = stemContext.includes("tasting")
    ? `\nIt was left on the **Layer-B tasting-note reveal** (Reverse Tasting), so it may concern the GENERATED TASTING NOTE for a wine — appearance/colour, aromas, or structure not matching the real wine (e.g. a white described as ruby) — which is a tasting generator/validator issue (tasting.ts / tasting-validators.ts), more likely Kind: generation or validator than answer-key.`
    : stemContext.includes("result")
      ? `\nIt was left on the **result/scoring page**, so it may concern how a guess was SCORED or CALIBRATED (grading, the Layer-A→Layer-B movement, the revealed key) as much as the answer key itself.`
      : `\nIt was left on the **stem page** (at the guess, before tasting), so it most likely concerns the stem wording, the answer key, or the question design.`;
  const stemSniperFraming = isStemSniper
    ? `

## STEM SNIPER CONTEXT
This feedback came from the **Stem Sniper** drill (predict variety+region, or **style/method**+region
for Paper 3, from the stem). It often concerns the **answer key** (ground-truth variety/style/region
buckets, the plausible/confusable set, tiers — e.g. "this Sherry is Manzanilla, not Amontillado";
"Vosne-Romanée is Pinot Noir"; "region should be Bordeaux, not 'Bordeaux Blanc'"). BUT it may instead
reveal a **bad question** or a **generation/validator gap**. Do not assume it is only an answer-key
issue — classify it with the Kind line below.${pageNote}
`
    : "";
  // Every analysis ends with a Kind line so apply-change can route the fix (and PR-gate the
  // high-stakes generation/validator ones). Feedback CAN and SHOULD reach question generation
  // and the validators — that is the most common root cause of a wrong question.
  const kindClassification = `

## CLASSIFY THE FIX (required) — put the Kind line in the INTERNAL section (after the [[INTERNAL]] marker), never in the candidate-facing part
- **Kind: answer-key** — a Stem Sniper answer-key DATA error (variety / style / region / plausible /
  tier). Applied to the stem_answer_keys data + a key rebuild; no app code.
- **Kind: question** — THIS specific generated question is invalid: its stem contradicts its wines
  (e.g. "four different countries" but two share a country; "same single grape variety" but the wines
  are different grapes). The question itself is quarantined/regenerated — not a code change.
- **Kind: generation** — the generation PIPELINE produces a *class* of bad questions; propose a change
  to the generation prompt/logic. (High-stakes — will be PR-gated for human review.)
- **Kind: validator** — a bad question PASSED validation and reached the user; propose a stronger check
  in the question validator. (High-stakes — PR-gated.)
- **Kind: feature-request** — the user is asking for NEW functionality that does not exist yet (a new
  mode, screen, button, workflow, drill, report, etc.), as opposed to fixing how an EXISTING thing
  behaves. This is NOT a fix and must NEVER be auto-built from feedback — feature-building is a separate,
  deliberate, admin-only flow. When you choose this Kind, set **recommendation: reject** (the pipeline
  routes it to the Feature Request engine instead of dispatching any code change). Litmus test: if
  satisfying the request means *adding a capability the app doesn't have*, it is \`feature-request\`; if
  it means *correcting wrong content/scoring/selection of something that already exists*, it is one of
  the fix Kinds above. If the same feedback ALSO praises this question itself ("good question, would be
  nice to have X"), add \`Endorse: yes\` on its own line in the INTERNAL section — the pipeline then
  logs the feature request AND flags the praised question as an exemplar, instead of "rejecting" praise.
- **Kind: praise** — the feedback is POSITIVE: the user says the question is good, realistic, or
  well-designed, and claims no defect. Set **recommendation: endorse**. Nothing is broken and nothing
  ships; the question is flagged as an endorsed exemplar that future generation treats as the quality
  bar, and the praise feeds the pattern miner as positive signal. If the praise carries an embedded
  suggestion about question DESIGN (e.g. "one wine could be New World for another dimension of
  contrast"), still use \`praise\` + endorse, and restate the suggestion clearly in the INTERNAL section
  on a \`Suggestion:\` line so the miner can pick it up — do NOT treat a design musing as a defect. But
  praise for the question combined with a genuine DEFECT claim elsewhere is not \`praise\` — classify by
  the defect and use accept/partial/reject as usual.
Pick the NARROWEST Kind that fixes the root cause: a one-off bad question is \`question\`; a recurring
pattern is \`generation\` or \`validator\`; a request for brand-new functionality is \`feature-request\`;
positive feedback with no defect claim is \`praise\`.

## WHERE THE LOGIC LIVES (target the right layer in your Proposed Change)
When you propose a code change, name the layer/file the fix actually belongs in — not just the
nearest file. Mis-targeting (e.g. "add a rule to the generation prompt") produces a fix that cannot
work when the real cause is elsewhere.
- **Question SELECTION / dedup / per-user "already seen" / which banked question is served** lives in
  the QUERY layer: \`study-app/src/lib/db.ts\` (e.g. \`getUnansweredQuestions\`, \`getRecentAttempts\`,
  \`getQuestionsByFilter\`). The route \`study-app/src/app/api/get-question/route.ts\` only *orchestrates*
  (priorities, fallback). A repetition / "I keep getting the same question" issue is almost always a
  db.ts + route fix, NOT a generation-prompt fix — the prompt/LLM cannot query a user's history.
- **NOVELTY of newly GENERATED questions** (don't generate a near-duplicate template) lives in
  \`validateNoveltyAgainstLatest\` in the get-question route + guidance in the generation prompt.
- **What a generated question CONTAINS** (wine choice, mark allocation, stem phrasing, style rules)
  lives in \`study-app/src/lib/prompts/question-generation-prompt.ts\`.
- **The GENERATED TASTING NOTE** (a wine's appearance/aroma/palate/structure not matching the real
  wine — e.g. a white described as ruby, a Sherry with no oxidative markers) lives in
  \`study-app/src/lib/prompts/tasting-prompt.ts\` (what the note says) and
  \`study-app/src/lib/tasting-validators.ts\` (what should have been caught). A note that is merely
  *implausible* is Kind: generation; a note that CONTRADICTS its own wine and shipped anyway is
  Kind: validator.
- **Hard validity gates** (stem contradicts wines/marks) live in \`study-app/src/lib/question-validator.ts\`.
- **Grading / scoring rules** — how an answer is MARKED (the plausibility gradient, howler/cascade,
  quality calibration, the funnel, verdict bands) — live in \`study-app/src/lib/prompts/marking-principles.ts\`
  (shared by both graders) and \`study-app/src/lib/prompts/funnelling.ts\`. A valid evaluation dispute that
  warrants a rubric change is **Kind: generation** naming marking-principles.ts — it is NOT a question/
  answer-key issue.
- A fix needing the query layer should say so explicitly (Kind: generation or validator, naming db.ts) —
  do not down-scope it to a prompt tweak just because the prompt is easier to reach.
`;
  const stemSniperBlock = stemSniperFraming + kindClassification;

  const system = `You are running feedback analysis for the MW Practical Exam Study System.
${stemSniperBlock}

## Purpose

Users leave feedback on generated MW exam questions — often disagreeing with the AI evaluation, questioning the wine selection, or flagging issues with question design. Your job is to determine whether each piece of feedback should be **ACCEPTED** (leading to a pipeline change), **REJECTED** (the system is already correct), or **ENDORSED** (the feedback is praise — the question is flagged as an exemplar), grounded in what the real MW exam has actually done over the past 10+ years (2011–2025). Reject is for a DISPUTED claim; it is never the bucket for positive feedback.

The key principle: the MW exam has done surprising things historically. A candidate saying "this would NEVER happen" may be wrong — if the past exams show it HAS happened, the feedback should be rejected and the system preserved. Conversely, if the feedback identifies a genuine gap or error not seen in any past exam, it should be accepted.

## Your Workflow

### Step 1: Understand the feedback
Parse the user's feedback to identify their specific claim(s):
- Are they saying the question design is flawed? (e.g., variety overlap, unrealistic wine selection)
- Are they disputing the AI evaluation? (e.g., "I was right about the variety")
- Are they saying the wines don't match what MW exams actually do?
- Are they suggesting a structural change to how questions are generated?

### Step 2: Cross-reference against the past 10+ years of real MW exams
Check if the pattern the user says "would never happen" has actually occurred in real MW exams (2011–2025). Look for:
- Similar question structures (same family type, same number of wines)
- Similar wine selections (same varieties, same regions, same blend patterns)
- Similar stem phrasing patterns
- Evidence that the MW DOES or DOES NOT do what the generated question did

### Step 2b: Check our accumulated knowledge & precedent
Consult the **Accumulated Empirical Knowledge** reference below — our own evidence-cited rulings, built
from this exact feedback loop. It is authoritative for what we have already decided and what we know:
- **§6 feedback ledger:** if a materially identical claim was already decided (accepted or rejected), be
  CONSISTENT with that ruling — or state explicitly why this case differs. Never silently contradict precedent.
- **§5 generation rules · §1 structure · §4 distribution:** if the feedback contradicts an established rule
  or a documented exam fact, weigh that heavily toward REJECT and cite the EK-#### entry. If it exposes a
  genuine gap not yet covered, that supports ACCEPT.
- **§7 bug catalog:** check whether this is a known, already-fixed issue (don't re-open it) or genuinely new.
- **§2 examiner mindset · §3 grading:** if the feedback disputes the AI's EVALUATION/score (e.g. "I was
  right", "you didn't credit my reasoning", "too harsh", "I should have passed"), THIS is the authoritative
  grounding — the examiner trust-account model, the **plausibility gradient** (a sound, stylistically-adjacent
  wrong call earns real partial credit; a bare correct call with no argument earns little), confidence ≠
  correctness, the **contamination law** (a howler undermines confidence across the whole answer), and the
  "under the skin" top-band differentiator. Judge the disputed score against these (and the Marking Rubric
  below when present); side with the candidate only where the grader genuinely misapplied a rule.
Use this knowledge to reason and to stay consistent with precedent. In the **candidate-facing** part of
your answer, refer to precedent in PLAIN LANGUAGE ("past papers have shown…", "our review of the exams
established…") — never print EK-#### ids, file paths, or the Kind line there. Reference EK-#### ids only
in the INTERNAL section (after the [[INTERNAL]] marker).

### Step 3: Produce your analysis

## Your Output Format

Produce TWO parts separated by a line containing EXACTLY \`[[INTERNAL]]\` on its own line.

### PART 1 — CANDIDATE-FACING (the candidate who left the feedback reads this)
Keep it high-level, respectful and educational. **NO EK-#### ids, NO file paths, NO code, NO "Kind:" line.**
Back up your reasoning with precedent in PLAIN LANGUAGE (cite real past exams by year/paper/question is fine —
"the 2019 Paper 3 did exactly this"; just never internal codes). Use this structure:

### Claim Analysis
{What exactly is the user claiming? Break it into specific testable assertions.}

### Evidence from Past MW Exams (2011–2025)
{What do the real MW exams show? If the pattern HAS occurred, cite the instance (year, paper, question).
If it HASN'T, note the absence and whether it's a deliberate gap or just hasn't come up. Plain language only.}

### Factual Check on User's Claims
{Check every factual claim the user makes about wine, winemaking, or the exam. If any are incorrect or imprecise, correct them respectfully (educational). Examples:
- User says "these are Merlot" but the wines are Cabernet Franc → correct this
- User says "whole cluster is common in the Loire" but it's actually rare → note this
- User says "the MW would never test X" but the corpus shows they have → cite the evidence
If all claims are factually correct, say "All factual claims verified."}

### Recommendation: ACCEPT, REJECT, PARTIAL, or ENDORSE
Use PARTIAL when:
- Some claims are valid but others are factually wrong
- The question has a real issue but the user's diagnosis of WHY is incorrect
- The user raises a valid nuance (e.g., winemaking technique) but the core question design is sound
Use ENDORSE when the feedback is praise with no defect claim (Kind: praise) — never REJECT praise.

**Reasoning:** {2-3 sentences, plain language, why — backed by precedent}

**What this means for you:**
{Speak to the candidate. ACCEPT → acknowledge the valid point and that the system will be improved (no code detail). REJECT → respectful, educational explanation citing past real exams. PARTIAL → what's right, what isn't, and what (if anything) changes. ENDORSE → thank them; their endorsement flags this question as an exemplar the generator learns from, and any suggestion they made feeds future question design.}

[[INTERNAL]]

### PART 2 — INTERNAL (engineering/admin only — NOT shown to the candidate)
Put ALL routing and technical detail here. This is where EK-#### references, file paths, the proposed
code change, and the Kind line belong.

### Current Pipeline Check
{Does the current generation prompt or validation logic already handle this? If so how; if not, the gap.}

### Precedent / EK references
{The EK-#### entries that informed this decision, if any — and whether this is consistent with prior rulings.}

**If ACCEPT — Proposed Change:**
{Specific, actionable change. Name the constraint, the section, and the file/layer it belongs in (see WHERE THE LOGIC LIVES).}

### Cohort (ONLY when the complaint is categorical about a WINE or STYLE)
A reviewer rejecting "another sparkling Syrah question" is not ruling on one question — they are
ruling on every question that does the same thing. Until this line existed, each sibling had to be
found and rejected SEPARATELY: on 2026-08-09 a reviewer binned five sparkling-Shiraz flights in three
minutes, increasingly angrily, while eleven more sat waiting in his queue.

Emit this line ONLY when the objection is to a wine or style that recurs across questions, and when a
person reading the label alone could tell which questions are in the cohort:

  Cohort: <2-6 comma-separated lowercase phrases that appear in the WINE LABEL>

Example, for "stop putting sparkling Syrah questions in":
  Cohort: sparkling shiraz, sparkling syrah, black queen, black shiraz

Rules for this line, all of them load-bearing because it quarantines questions automatically:
- Phrases match against the wine LABEL text only, case-insensitively, as substrings. Nothing else.
- EVERY PHRASE MUST BE AT LEAST TWO WORDS. A single word is a category — a grape, a style, a country —
  and single-word phrases are DISCARDED before they are applied. "shiraz" alone would take out every
  Barossa red; "sparkling" alone would take out Champagne. "sparkling shiraz" identifies the thing
  being complained about. Measured against the live bank: "brut" matches 51 questions, "shiraz" 20,
  "sparkling shiraz" 2.
- OMIT the line entirely for anything that is not a recurring wine/style objection — a mark
  allocation, a stem wording, a one-off factual error. Most analyses should NOT emit it.
- Do not emit it to express "this wine is bad in this flight". Only "this wine should not be
  appearing in questions at all, or is wildly over-represented".

{End with the Kind line — see CLASSIFY THE FIX.}
${roleDisputeSection}

## Important Rules

1. **The past exams are authoritative.** If the real MW exam has done something in any year from 2011–2025, the generated questions should be allowed to do it too. "This seems unusual" is not a valid reason to reject a pattern that appears in a real past exam.

2. **Don't over-correct.** A single feedback item about an edge case doesn't warrant a sweeping prompt change. Scope the fix tightly to the actual issue.

3. **Distinguish evaluation feedback from generation feedback.** If the user is saying "I was right and the AI scored me wrong," that's an evaluation quality issue, not a generation pipeline issue. Note this difference. **For evaluation disputes, adjudicate the SCORE against §2/§3 and the Marking Rubric:** was the plausibility gradient applied (a well-reasoned, stylistically-adjacent wrong call should earn partial credit, not zero)? was a bare correct call over-rewarded relative to a well-argued wrong one? was a howler's contamination or a cascade handled correctly, not over-applied? Uphold the candidate only where the grader genuinely misapplied a rule; otherwise explain the rule in plain language. If a valid grading dispute reveals a real rubric gap, the fix targets the grader rubric — classify it **Kind: generation** and name marking-principles.ts.

4. **Consider the candidate's level.** MW candidates are experts. Their feedback often contains genuine insight. Don't dismiss it reflexively — but do verify it against what the real exams have actually done.

5. **Be specific about changes.** Don't say "update the prompt." Say exactly what constraint should be added or modified.

6. **Judge the artifact, not a reconstruction of it.** When present, THE ATTEMPT RECORD below contains
   what the system actually generated for this attempt — the tasting notes the candidate tasted from,
   the pre-glass critique, and the verbatim grading with its verdict and marks. If the feedback concerns
   any of those, quote and adjudicate the ACTUAL text. Never infer what the tasting note or the grader
   "would have" said from the model answer when the real thing is in front of you, and never dismiss a
   complaint as unsupported because you did not look for the artifact it names. If the record is absent
   for the step being complained about (the candidate left feedback before reaching it), say so plainly
   rather than assuming the system behaved correctly.

## Reference Data

${empiricalKnowledge ? `### Accumulated Empirical Knowledge — our own rulings & rules (cite EK-#### ids)
This is the canonical, evidence-cited log of what we have learned and decided across constant review of
the exams and prior feedback (decision-relevant sections: §1 structure, §4 distribution, §5 generation
rules, §6 feedback ledger, §7 bug catalog). Treat §6 as precedent and §5/§7 as current rules — see Step 2b.

${empiricalKnowledge}

---
` : ""}${isEvaluationDispute ? `### Marking Rubric — the EXACT rules the grader was instructed with (use to adjudicate this SCORING dispute)
This feedback disputes the AI's evaluation/score. Judge the score against THESE rules (the same constant the grader followed) together with §2/§3 of the Empirical Knowledge above. Side with the candidate only if the grader misapplied a rule — e.g. failed to credit a stylistically-plausible wrong call on the plausibility gradient, over-credited a bare correct call, or mis-handled a howler's contamination. Otherwise, explain the rule that justifies the score in plain, educational language.

${MARKING_PRINCIPLES}

---
` : ""}### Examiner Report Synthesis (2017–2025)
${examinerSynthesis}

### Curveball Analysis
${curveballAnalysis}

${wineComposition ? `### Wine Composition Rules\n${wineComposition}` : ""}

### Historical Paper ${params.paper} Questions (same paper as the feedback question)
${samePaperQuestions}`;

  let threadContext = "";
  if (params.previousThread && params.previousThread.length > 0) {
    threadContext = "\n\n## Previous Analysis Thread\n" +
      params.previousThread.map((m) =>
        `**${m.role === "system" ? "Analysis" : "User follow-up"}** (${m.timestamp}):\n${m.content}`
      ).join("\n\n---\n\n") +
      "\n\n## Instructions\nThe user has sent a follow-up to the previous analysis. Re-evaluate considering their additional context. You may change your recommendation if the new information warrants it.";
  }

  const userName = params.userName || "User";

  // THE ATTEMPT RECORD. Feedback most often concerns something the system GENERATED for this
  // specific attempt — the tasting note, the pre-glass critique, the grading — none of which used to
  // reach this prompt, so complaints about them were adjudicated by inference from the model answer.
  // Include whatever the attempt actually reached; omit sections with nothing in them rather than
  // printing empty headers the model would have to interpret.
  const a = params.attempt;
  const tastingNotes = normalizeTastingNotes(a?.tastingNotes);
  const attemptParts: string[] = [];
  if (tastingNotes.length > 0) {
    attemptParts.push(
      `#### Generated Tasting Notes (what the candidate was given to taste "blind" — one per wine, in slot order)
These were produced by the tasting generator for THIS attempt. If the feedback concerns a wine's
appearance, aroma, palate or structure, judge it against THESE, not against the model answer.

${tastingNotes.map((n, i) => `**Wine ${i + 1}:** ${n.slice(0, 2500)}`).join("\n\n")}`
    );
  }
  if (a?.preGlassReasoning?.trim()) {
    attemptParts.push(`#### Candidate's Pre-Glass Reasoning (before tasting)\n${a.preGlassReasoning.slice(0, 2500)}`);
  }
  if (a?.preGlassFeedback?.trim()) {
    attemptParts.push(`#### System's Pre-Glass Critique (what the system told them before tasting)\n${a.preGlassFeedback.slice(0, 3000)}`);
  }
  if (a?.answerFeedback?.trim()) {
    const verdict = [
      a.passEstimate ? `verdict **${a.passEstimate.toUpperCase()}**` : null,
      a.marksEstimate ? `marks **${a.marksEstimate}**` : null,
    ]
      .filter(Boolean)
      .join(", ");
    attemptParts.push(
      `#### System's Grading of This Answer${verdict ? ` (${verdict})` : ""}
This is the VERBATIM evaluation the candidate received. If the feedback disputes the score or the
critique, adjudicate THIS text against the Marking Rubric — do not reconstruct what the grader
"probably" said.

${a.answerFeedback.slice(0, 6000)}`
    );
  }
  const conditions = [
    a?.mode ? `mode: ${a.mode}` : null,
    a?.stemDetail
      ? `stem detail: ${a.stemDetail}${a.stemDetailEscalatedTo ? ` → escalated to ${a.stemDetailEscalatedTo}` : ""}`
      : null,
    a?.appVersion ? `build: ${a.appVersion}` : null,
  ].filter(Boolean);
  if (conditions.length > 0) {
    attemptParts.push(`#### Attempt Conditions\n${conditions.join(" · ")}`);
  }
  const attemptBlock =
    attemptParts.length > 0
      ? `\n### THE ATTEMPT RECORD — what the system actually generated and showed this candidate\n\n${attemptParts.join("\n\n")}\n`
      : "";

  const user = `## Feedback Analysis Request

**User:** ${userName}
**Question:** Paper ${params.paper} / ${params.familyLabel}

### Question Text
${params.questionText}

### Wines
${params.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n")}

### User's Feedback
"${params.userFeedback}"

${params.userAnswer ? `### User's Answer\n${params.userAnswer}` : ""}
${attemptBlock}
${params.modelAnswer ? `### Model Answer (reference — for context on what the system told the user)\n${params.modelAnswer.slice(0, 4000)}` : ""}

${params.reasoningTrace?.trim() ? `### Model-Answer Reasoning Trace (internal — how the system reached the model answer above)\n${params.reasoningTrace.slice(0, 3000)}\n` : ""}
${params.questionMetadata ? `### Question Generation Metadata (internal — shows WHY the system made its choices)
This is the system's internal reasoning when it generated this question. Use it to understand what the system already considered and whether the user's feedback points to something the system missed vs something it deliberately chose.

**Generation Reasoning:** ${(params.questionMetadata as Record<string, unknown>).generationReasoning || "Not available"}

**Validation Results:**
${(params.questionMetadata as Record<string, unknown>).paperScopeCheck ? `- Paper Scope Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).paperScopeCheck)}` : ""}
${(params.questionMetadata as Record<string, unknown>).varietyCheck ? `- Variety Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).varietyCheck)}` : ""}
${(params.questionMetadata as Record<string, unknown>).originDiversityCheck ? `- Origin Diversity Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).originDiversityCheck)}` : ""}
${(params.questionMetadata as Record<string, unknown>).countryDiversityCheck ? `- Country Diversity Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).countryDiversityCheck)}` : ""}
${(params.questionMetadata as Record<string, unknown>).noveltyCheck ? `- Novelty Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).noveltyCheck)}` : ""}` : ""}
${threadContext}

Please analyze this feedback using the workflow above and produce your structured recommendation.`;

  // The candidate's chosen voice — appended last so it supersedes "keep it high-level, respectful
  // and educational" in the PART 1 spec above.
  //
  // SCOPED TO PART 1 ONLY. Part 2 is read by admins and parsed by the fix pipeline; a Cellar Rat
  // routing note would be both unhelpful and, where the pipeline pattern-matches on it, actively
  // harmful. The recommendation token itself (ACCEPT/REJECT/PARTIAL/ENDORSE) is a machine-read
  // enum, not prose, and no voice may reword it — hence the explicit carve-out here as well as the
  // generic invariants inside the block.
  const personaScoped = `${personaBlock(params.persona, "verdict")}

**SCOPE OF THE VOICE.** It applies to PART 1, the candidate-facing half, and to nothing else.
Everything after the \`[[INTERNAL]]\` marker is read by engineers and parsed by an automated fix
pipeline: write it in neutral technical prose whatever voice is selected. The
\`### Recommendation:\` line is a machine-read token — print ACCEPT, REJECT, PARTIAL or ENDORSE
exactly, never a stylised variant of it — and every required heading in both parts stays
verbatim.`;

  return { system: `${system}\n\n${personaScoped}`, user };
}
