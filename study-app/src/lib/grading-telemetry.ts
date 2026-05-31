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
<!-- GRADING_META {"verdict":"PASS|BORDERLINE|FAIL","howlerPresent":true|false,"howler":"<short phrase or null>","cascadeFlag":true|false} -->
Set the flags strictly, per the Howlers and Cardinal Rule 10 sections above:
- howlerPresent = true ONLY for a factually IMPOSSIBLE claim in the CANDIDATE'S answer — a wrong country/region pairing ("Douro, Spain"), an impossible parameter (15% Burgundian Pinot Noir, 20% VDN), or a wrong production method for a classic style (Tawny in a solera, Amontillado at 14.5%). A merely wrong-but-plausible identification is NOT a howler. If none: howlerPresent=false, howler=null.
- cascadeFlag = true ONLY when the candidate misidentified the wine and then answered downstream sub-questions for the GUESSED wine instead of the glass, OR gave self-contradictory structural figures. A wrong ID whose downstream answer still describes the glass faithfully is NOT a cascade.
- verdict = the SAME PASS/BORDERLINE/FAIL you stated in your visible feedback.`;

export type GradingMeta = {
  verdict?: "PASS" | "BORDERLINE" | "FAIL";
  howlerPresent?: boolean;
  howler?: string | null;
  cascadeFlag?: boolean;
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

// Detect-only: warn to server logs when a HARD override should have fired but the model's verdict
// disagrees, so we can measure how often the grader silently fails to apply its own hard rules (and the
// false-positive rate of the howler flag) before deciding whether enforcement is safe. Never throws.
export function recordGradingOverrideCheck(
  meta: GradingMeta | null,
  ctx: { grader: string; userId?: number | null }
): void {
  if (!meta) return;
  try {
    const tag = `[grading-override] grader=${ctx.grader} user=${ctx.userId ?? "?"} verdict=${meta.verdict ?? "?"}`;
    if (meta.howlerPresent && meta.verdict === "BORDERLINE") {
      console.warn(`${tag} MISMATCH: howler present + BORDERLINE → the IMW rule resolves this to FAIL, but the grader kept BORDERLINE. howler=${JSON.stringify(meta.howler ?? null)}`);
    }
    if (meta.cascadeFlag) {
      console.warn(`${tag} NOTE: cascadeFlag=true → the affected conclusion mark should be zero; verify the grader applied it.`);
    }
  } catch {
    /* telemetry must never break the response */
  }
}
