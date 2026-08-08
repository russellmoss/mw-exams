import { neon } from "@neondatabase/serverless";

// Phase 4b — DETECT-ONLY grading-override telemetry.
//
// The two HARD marking rules (a clear HOWLER tips a BORDERLINE script to FAIL; a CASCADE /
// self-contradiction zeroes the affected conclusion mark) are written in MARKING_PRINCIPLES, but
// nothing checks the grader actually applied them — the graders stream free prose and we trust it.
//
// So each grader now appends a hidden machine-readable tag (an HTML comment, invisible once the
// markdown is rendered) carrying its own {verdict, howlerPresent, howler, cascadeFlag}. Server-side we
// extract it, strip it from the saved feedback, and LOG when a HARD override SHOULD have fired but the
// verdict disagrees. This is purely observability: we NEVER change the verdict or the streamed
// feedback. Any future auto-enforcement is a separate, gated, two-pass project (decide verdict first,
// then write prose) — see exam_improvement_plan.md Phase 4b.

// Appended to BOTH grader prompts (not to MARKING_PRINCIPLES — that constant is also fed to the
// model-answer generator, which must NOT emit this tag). Tells the grader to end with the hidden tag and
// sets strict criteria for the two flags so they aren't vague.
export const GRADING_META_INSTRUCTION = `## Machine-readable verdict tag (REQUIRED — emit LAST, exactly once, after all visible feedback)
On the final line, append a single HTML comment — it is INVISIBLE to the candidate (internal QA only) and must NOT change anything you wrote above. Use EXACTLY this form:
<!-- GRADING_META {"verdict":"PASS|BORDERLINE|FAIL","howlerPresent":true|false,"howler":"<short phrase or null>","cascadeFlag":true|false,"wrongCallPlausible":true|false|null,"creditGiven":"none|partial|full|null"} -->
Set the flags strictly, per the Howlers and Cardinal Rule 10 sections above:
- howlerPresent = true ONLY for a factually IMPOSSIBLE claim in the CANDIDATE'S answer — a wrong country/region pairing ("Douro, Spain"), an impossible parameter (15% Burgundian Pinot Noir, 20% VDN), or a wrong production method for a classic style (Tawny in a solera, Amontillado at 14.5%). A merely wrong-but-plausible identification is NOT a howler. If none: howlerPresent=false, howler=null.
- cascadeFlag = true ONLY when the candidate misidentified the wine and then answered downstream sub-questions for the GUESSED wine instead of the glass, OR gave self-contradictory structural figures. A wrong ID whose downstream answer still describes the glass faithfully is NOT a cascade.
- wrongCallPlausible = for the PRIMARY identification/origin sub-question only: true if the candidate's call was WRONG but stylistically PLAUSIBLE/adjacent (the kind that earns real partial credit on the plausibility gradient); false if WRONG and IMPLAUSIBLE (neither the listed confusables nor otherwise stylistically adjacent — earns little); null if the call was CORRECT or there was no identification sub-question.
- creditGiven = how much of the identification CONCLUSION credit you actually awarded on that primary sub-question: "none" | "partial" | "full" (null if N/A). This must be consistent with wrongCallPlausible — an implausible wrong call should not receive "full"; a plausible wrong call should not receive "none".
- verdict = the SAME PASS/BORDERLINE/FAIL you stated in your visible feedback.`;

export type GradingMeta = {
  verdict?: "PASS" | "BORDERLINE" | "FAIL";
  howlerPresent?: boolean;
  howler?: string | null;
  cascadeFlag?: boolean;
  // PG-2 (detect-only): the grader's self-report on how it applied the plausibility gradient (EK-0112 /
  // marking-principles Cardinal Rule 1) to the primary ID/origin sub-question, so we can MEASURE whether
  // wrong-but-plausible calls are credited and implausible ones are not — before deciding any enforcement.
  wrongCallPlausible?: boolean | null;
  creditGiven?: "none" | "partial" | "full" | null;
};

const META_RE = /<!--\s*GRADING_META\s*(\{[\s\S]*?\})\s*-->/i;

// Pull the hidden tag out of the grader's full text; return the parsed meta + the text with the tag
// removed (so the saved/rendered feedback never shows it). Fully defensive: any failure → meta:null and
// the original text untouched, so a missing/malformed tag can never break the response.
export function extractGradingMeta(fullText: string): { meta: GradingMeta | null; cleanedText: string } {
  const m = fullText.match(META_RE);
  if (!m) return { meta: null, cleanedText: fullText };
  const cleanedText = fullText.replace(META_RE, "").replace(/\n{3,}$/, "\n").trimEnd();
  try {
    return { meta: JSON.parse(m[1]) as GradingMeta, cleanedText };
  } catch {
    return { meta: null, cleanedText };
  }
}

// Detect-only: persist every grading event's self-reported verdict tag to `grading_telemetry`
// (migration 008) and warn to server logs when a HARD override should have fired but the model's
// verdict disagrees. The persisted rows let us MEASURE how often the grader silently fails to apply its
// own hard rules — and the false-positive rate of the howler flag — before deciding whether enforcement
// (R8) is safe; they also gate R5 (difficulty calibration) and R7 (pre-glass hint). NEVER changes a
// verdict, NEVER throws. Awaited by callers so the row lands before the serverless function unwinds; the
// Neon write is best-effort (a logging failure must never break a candidate's grading).
export async function recordGradingOverrideCheck(
  meta: GradingMeta | null,
  ctx: {
    grader: string;
    userId?: number | null;
    paper?: number | null;
    questionId?: string | null;
    /**
     * The answer-key CLAIM check for this grading event (migration 064), when the caller ran one.
     * Unlike the GRADING_META flags above this one is NOT detect-only — a hard violation triggers a
     * single correction pass — so the row records both what the first draft failed on and what was
     * still wrong in the text that actually shipped.
     */
    claims?: {
      violations: { rule: string }[];
      failureReason: string | null;
      originalFailureReason: string | null;
      regenerated: boolean;
      correctionFailed: boolean;
    } | null;
  }
): Promise<void> {
  const claims = ctx.claims ?? null;
  // Fire on SOFT violations too, not just the hard ones that triggered a correction. Rule 1 is soft
  // whenever the wine's role is only derived rather than keyed, which today is always — so counting only
  // hard fires would record nothing at all about the rule with the largest exposure. A soft-only event
  // is the row where claim_rules is non-empty and claim_reason_before is NULL.
  const claimFired = !!claims && (!!claims.originalFailureReason || claims.violations.length > 0);
  // A missing GRADING_META tag must not swallow a claim-check result: the two signals are independent,
  // and the claim rows are the ones with a cost attached.
  if (!meta && !claimFired) return;

  // The same conditions warned on below, precomputed so DB base/false-positive rates are a trivial COUNT.
  const howlerBorderlineMismatch = meta?.howlerPresent === true && meta?.verdict === "BORDERLINE";
  const overcreditMismatch = meta?.wrongCallPlausible === false && meta?.creditGiven === "full";
  const undercreditMismatch = meta?.wrongCallPlausible === true && meta?.creditGiven === "none";
  const claimRules = claimFired ? [...new Set((claims?.violations ?? []).map((x) => x.rule))] : null;

  try {
    const tag = `[grading-override] grader=${ctx.grader} user=${ctx.userId ?? "?"} verdict=${meta?.verdict ?? "?"}`;
    if (howlerBorderlineMismatch) {
      console.warn(`${tag} MISMATCH: howler present + BORDERLINE → the IMW rule resolves this to FAIL, but the grader kept BORDERLINE. howler=${JSON.stringify(meta?.howler ?? null)}`);
    }
    if (meta?.cascadeFlag) {
      console.warn(`${tag} NOTE: cascadeFlag=true → the affected conclusion mark should be zero; verify the grader applied it.`);
    }
    // PG-2 plausibility-gradient mismatches (EK-0112): the gradient says a plausible wrong call earns
    // partial credit and an implausible one earns little. Flag both failure directions for measurement.
    if (overcreditMismatch) {
      console.warn(`${tag} MISMATCH: implausible wrong call awarded FULL conclusion credit → the plausibility gradient (EK-0112) says an implausible miss earns little; possible over-credit.`);
    }
    if (undercreditMismatch) {
      console.warn(`${tag} MISMATCH: plausible wrong call awarded NO conclusion credit → the plausibility gradient (EK-0112) says a stylistically-adjacent miss earns real partial credit; possible under-credit.`);
    }
    // Answer-key claim check (migration 064). Unlike the flags above this one ACTED, so the log says
    // what it did — and says so loudest when the correction did not take, which is the case that both
    // costs money and still ships a wrong claim.
    if (claimFired) {
      const what = `rules=${claimRules?.join(",")} reason=${JSON.stringify(claims?.originalFailureReason ?? null)}`;
      if (!claims?.originalFailureReason) {
        // Soft-only: nothing was rewritten and nothing was billed. Logged at info because this is the
        // measurement channel, not an incident — a soft Rule 1 flag is as often the classifier's fault
        // as the prose's, which is precisely what the accumulated rows are meant to settle.
        console.info(`${tag} CLAIM: answer-key claim flagged for review only (no correction, nothing billed). ${what}`);
      } else if (claims?.correctionFailed) {
        console.warn(`${tag} CLAIM: answer-key violation NOT corrected — the corrector failed, so the original prose shipped. ${what}`);
      } else if (claims?.failureReason) {
        console.warn(`${tag} CLAIM: answer-key violation SURVIVED its correction pass — the redraft still fails. still=${JSON.stringify(claims.failureReason)} ${what}`);
      } else {
        console.warn(`${tag} CLAIM: answer-key violation corrected on the single regeneration. ${what}`);
      }
    }
  } catch {
    /* warns must never break the response */
  }

  // Persist the event (append-only). Fire-and-forget semantics — swallows its own errors so a logging
  // failure can never break grading. Mirrors logClaudeUsage in usage-log.ts.
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO grading_telemetry (
        grader, user_id, paper, question_id,
        verdict, howler_present, howler, cascade_flag, wrong_call_plausible, credit_given,
        howler_borderline_mismatch, overcredit_mismatch, undercredit_mismatch,
        claim_reason_before, claim_reason_after, claim_rules, claim_regenerated, claim_correction_failed
      ) VALUES (
        ${ctx.grader}, ${ctx.userId ?? null}, ${ctx.paper ?? null}, ${ctx.questionId ?? null},
        ${meta?.verdict ?? null}, ${meta?.howlerPresent ?? null}, ${meta?.howler ?? null},
        ${meta?.cascadeFlag ?? null}, ${meta?.wrongCallPlausible ?? null}, ${meta?.creditGiven ?? null},
        ${howlerBorderlineMismatch}, ${overcreditMismatch}, ${undercreditMismatch},
        ${claims?.originalFailureReason ?? null}, ${claims?.failureReason ?? null},
        ${claimRules}, ${claims?.regenerated ?? false}, ${claims?.correctionFailed ?? false}
      )
    `;
  } catch (err) {
    console.error("[grading-telemetry] failed to persist grading event:", err);
  }
}
