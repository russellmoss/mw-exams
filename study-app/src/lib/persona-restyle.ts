// The second pass: re-voice a debrief that has ALREADY been graded.
//
// WHY THIS EXISTS. Handing a persona to a grading model changes the grade. Measured, not feared —
// `tests/persona-grading.eval.test.ts` graded one script under all four voices and got three
// different verdicts, and a "do not be generous" correction swung the Cellar Rat nineteen points
// the other way. A voice whose register is evaluative leaks into the judgement in whichever
// direction it was last pushed, so no amount of prompt wording makes single-pass grading safe.
//
// So the assessment and the delivery are separated in TIME. Pass 1 grades in the neutral voice and
// never learns which persona is selected (`resolvePersonaFor` pins graded surfaces to the Tutor).
// Pass 2 receives the finished text and may only change how it reads. The marks are then identical
// because they were computed once, by a call that could not have been influenced.
//
// INSTRUCTIONS ARE NOT A GUARANTEE — THE FINGERPRINT IS. Pass 2 is told not to touch a number, and
// pass 2 is a language model, so it is also CHECKED: every verdict token, mark fraction, heading,
// image token, machine-readable tag and list item is extracted from both texts and compared. Any
// difference and the restyle is discarded. That makes the failure mode of this entire feature
// "you get the Tutor's wording", which is exactly today's behaviour and can never cost a mark.
//
// COST AND LATENCY LAND ONLY ON PEOPLE WHO OPTED IN. A candidate on the default persona takes the
// early return: no second call, no extra tokens, no extra wait.

import type Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import {
  DEFAULT_PERSONA,
  getPersona,
  personaBlock,
  type PersonaId,
  type PersonaSurface,
} from "@/lib/personas";
import { getGrokKeyForUserId } from "@/lib/grok-key";
import { getUserFirstName } from "@/lib/persona-server";
import { grokComplete } from "@/lib/grok";

/** Why a restyle did not end up being used. Logged, and useful telemetry on its own. */
export type RestyleOutcome =
  | "applied"
  | "default_persona"
  | "disabled"
  | "empty_output"
  | "assessment_drift"
  /** The persona's copy vendor needs a key this user does not have. Degrades to the neutral text. */
  | "no_copy_key"
  | "error";

export interface RestyleResult {
  /** The text to show and persist. The neutral text unless `outcome === "applied"`. */
  text: string;
  outcome: RestyleOutcome;
  /** Populated on assessment_drift — which parts of the fingerprint moved. */
  drift?: string[];
}

// ── The fingerprint ──────────────────────────────────────────────────────────────────────────
//
// Everything a restyle is forbidden to move. Deliberately over-inclusive: a false rejection costs
// a candidate their chosen wording, while a false acceptance costs them a wrong mark, and those
// are not comparable.

export interface AssessmentFingerprint {
  /** PASS / BORDERLINE / FAIL occurrences, in document order. */
  verdicts: string[];
  /** Every "X/Y" mark fraction, in order. */
  fractions: string[];
  /** Every "Estimated marks: 28-32 out of 50" triple, normalised. */
  markPhrases: string[];
  /** Every markdown heading line, verbatim — the UI parses these. */
  headings: string[];
  /** [[IMG:...]] tokens, sorted; the enrichment step resolves them by exact match. */
  imageTokens: string[];
  /** HTML comments — SECTION_MARKS and GRADING_META are machine-read. */
  machineTags: string[];
  /**
   * How many list items there are. The blunt but effective "every finding survives" check: a
   * dropped bullet is a dropped finding, and no re-voicing has any reason to merge two.
   */
  bullets: number;
}

export function fingerprintAssessment(text: string): AssessmentFingerprint {
  const all = (re: RegExp): string[] => [...text.matchAll(re)].map((m) => m[0]);

  return {
    verdicts: all(/\b(?:PASS|BORDERLINE|FAIL)\b/g),
    fractions: [...text.matchAll(/(\d+)\s*\/\s*(\d+)/g)].map((m) => `${m[1]}/${m[2]}`),
    markPhrases: [...text.matchAll(/Estimated marks:\s*\**\s*([\d\s,–—-]+?)\s*\**\s*(?:out of|\/)\s*\**\s*(\d+)/gi)]
      // Whitespace-normalised so re-wrapping a line is not read as a changed mark.
      .map((m) => `${m[1].replace(/\s+/g, "")}|${m[2]}`),
    headings: text
      .split("\n")
      .filter((l) => /^#{1,6}\s/.test(l.trim()))
      .map((l) => l.trim()),
    imageTokens: [...new Set(all(/\[\[IMG:[^\]]*\]\]/g))].sort(),
    machineTags: all(/<!--[\s\S]*?-->/g).map((s) => s.replace(/\s+/g, " ").trim()),
    bullets: text.split("\n").filter((l) => /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(l)).length,
  };
}

/** The fingerprint fields that differ. Empty means the assessment survived intact. */
export function assessmentDrift(
  neutral: AssessmentFingerprint,
  styled: AssessmentFingerprint
): string[] {
  const drift: string[] = [];
  const cmp = (key: keyof AssessmentFingerprint) => {
    if (JSON.stringify(neutral[key]) !== JSON.stringify(styled[key])) {
      drift.push(`${key}: ${JSON.stringify(neutral[key])} → ${JSON.stringify(styled[key])}`);
    }
  };
  (
    ["verdicts", "fractions", "markPhrases", "headings", "imageTokens", "machineTags", "bullets"] as const
  ).forEach(cmp);
  return drift;
}

// ── The pass ─────────────────────────────────────────────────────────────────────────────────

/** Exported for tests: the constraints below are the only thing standing between a re-voicing
 *  and a mangled mark, so they are asserted rather than assumed. */
export function buildRestyleSystem(
  persona: PersonaId,
  surface: PersonaSurface,
  candidateName?: string | null
): string {
  return `You are re-voicing a piece of exam feedback that has ALREADY been marked by an examiner. The grading is finished, it is not yours, and you are not reviewing it. Your only job is to say the same things in a different voice.

## WHAT IS FROZEN, AND WHAT MUST CHANGE

Two different things, and confusing them is how this goes wrong in both directions. Read both lists.

### FROZEN — machine-checked, and your whole rewrite is DISCARDED if any of it moves
1. **Every number.** Marks, fractions like 12/15, totals, percentages, alcohol figures, years, prices — reproduced exactly, in the same order.
2. **Every verdict.** PASS, BORDERLINE and FAIL appear the same number of times, in the same places, spelled the same. You may not soften a FAIL or upgrade a BORDERLINE, and you may not editorialise about whether it was right.
3. **Every heading, character for character**, including its \`#\` markers. \`### Overall Assessment\` stays \`### Overall Assessment\` — do not restyle it, bold it, merge it, reorder it or drop it. The app parses these.
4. **The NUMBER of list items**, and the claim each one makes. Fourteen bullets in, fourteen bullets out, each carrying the same point as the one it replaces. Never merge two, never drop one, never add one of your own.
5. **\`[[IMG:...]]\` tokens and \`<!-- ... -->\` comments**, byte for byte, in place.
6. **The judgements themselves.** Do not add a criticism the examiner did not make, invent an error to be funny about, drop a criticism to be kind, or add praise that was not earned.

### MUST CHANGE — the prose, all of it
**Rewrite the actual words of every sentence.** The frozen list above is scaffolding: numbers, headings, tokens, and how many bullets there are. Everything BETWEEN that scaffolding is yours and has to be rewritten in the voice below.

**Passing a sentence through unchanged is a failure.** The specific way this goes wrong: adding one line in the voice at the top and then reproducing the original body verbatim, which technically satisfies every frozen rule and completely fails the job. If a bullet comes back word-for-word identical to the one you were given, you did not do the work on that bullet.

So, concretely: same claim, same number, **different words** — every strength, every "could improve", every paragraph, every takeaway. Say what the original said, in your own mouth.

${personaBlock(persona, surface, { bypassSurfaceGate: true })}
${candidateName ? `
THE CANDIDATE'S NAME IS **${candidateName}**. Use it as the voice above directs.
` : ""}
## OUTPUT
Return the rewritten text and nothing else — no preamble, no explanation, no code fence around it.`;
}

/**
 * Re-voice finished feedback, or return it untouched.
 *
 * `onDelta` streams the styled text as it arrives, for callers that suppressed pass 1 from the
 * client. It is only called while the rewrite is still a candidate — if the fingerprint check then
 * rejects it, the caller must overwrite what it streamed with `text` (the debrief does this
 * through its existing authoritative `{enriched}` frame).
 */
export async function restyleForPersona(opts: {
  neutralText: string;
  persona: PersonaId;
  surface: PersonaSurface;
  client: Anthropic;
  /**
   * The caller's key, used to resolve pass 2's OWN model tier — deliberately not the grader's
   * model. Re-wording finished text is not a reasoning task, and the first live run on Opus spent
   * 3.2k output tokens and 36 seconds re-saying what pass 1 had already decided. Correctness here
   * is enforced structurally by the fingerprint gate below, not by model strength, so this runs on
   * the cheaper tier (AB_TASKS `persona_restyle`).
   */
  apiKey: string;
  /**
   * Needed to resolve an EXTERNAL copy vendor's key (BYOK, with the usual admin server fallback).
   * Omitted, a persona voiced by another vendor degrades to the neutral text rather than failing.
   */
  userId?: number | null;
  // `source` is optional to match the callers' own usage-meta types, where it is inferred from the
  // key resolution and can be undefined; logClaudeUsage already tolerates that.
  usage: {
    taskType: string;
    source?: "user" | "server";
    userId?: number | null;
    abGroup?: string | null;
  };
  /** Headroom for the rewrite. Defaults to generous — a truncated debrief fails the gate anyway. */
  maxTokens?: number;
  onDelta?: (text: string) => void;
}): Promise<RestyleResult> {
  const { neutralText, persona, surface, client } = opts;

  if (persona === DEFAULT_PERSONA) {
    return { text: neutralText, outcome: "default_persona" };
  }

  // Resolved here rather than threaded through four call sites — cached, and fail-soft to null,
  // in which case the voice simply does not address them by name.
  const candidateName = await getUserFirstName(opts.userId);
  const system = buildRestyleSystem(persona, surface, candidateName);
  const userTurn =
    `Re-voice the following. Reproduce every number, verdict, heading, list item, token and ` +
    `comment exactly.

<feedback>
${neutralText}
</feedback>`;

  // A persona voiced by another vendor never touches the Anthropic path below. Same gate applies
  // to whatever comes back — the fingerprint does not care who wrote it.
  const copyProvider = getPersona(persona).copyProvider;
  if (copyProvider === "grok") {
    const grokKey = opts.userId != null ? await getGrokKeyForUserId(opts.userId) : null;
    if (!grokKey) {
      console.warn(`[persona-restyle] ${persona} needs an xAI key; serving the neutral text`);
      return { text: neutralText, outcome: "no_copy_key" };
    }
    const out = await grokComplete({
      apiKey: grokKey.key,
      system,
      user: userTurn,
      maxTokens: opts.maxTokens ?? 8000,
      usage: { taskType: opts.usage.taskType, userId: opts.userId, source: opts.usage.source },
    });
    if (!out?.text) return { text: neutralText, outcome: "empty_output" };
    const grokDrift = assessmentDrift(
      fingerprintAssessment(neutralText),
      fingerprintAssessment(out.text)
    );
    if (grokDrift.length) {
      console.warn(`[persona-restyle] discarded ${persona} (grok) rewrite — drift:`, grokDrift);
      return { text: neutralText, outcome: "assessment_drift", drift: grokDrift };
    }
    // Streamed to the client in one go: grokComplete is non-streaming by design (see lib/grok.ts).
    opts.onDelta?.(out.text);
    return { text: out.text, outcome: "applied" };
  }

  try {
    const { model, abGroup } = await selectModel("persona_restyle", opts.apiKey, "sonnet");
    const t0 = Date.now();
    const stream = client.messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      system: buildRestyleSystem(persona, surface),
      messages: [
        {
          role: "user",
          content: `Re-voice the following. Reproduce every number, verdict, heading, list item, token and comment exactly.\n\n<feedback>\n${neutralText}\n</feedback>`,
        },
      ],
    });
    if (opts.onDelta) stream.on("text", (d) => opts.onDelta!(d));

    const message = await stream.finalMessage();
    logClaudeUsage(
      { ...opts.usage, model, abGroup: abGroup ?? opts.usage.abGroup ?? null },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const styled = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // A truncated or empty rewrite is not a partial success. Reasoning can eat the whole budget on
    // a long debrief, which shows up here as no text at all.
    if (!styled) return { text: neutralText, outcome: "empty_output" };

    const drift = assessmentDrift(fingerprintAssessment(neutralText), fingerprintAssessment(styled));
    if (drift.length) {
      console.warn(`[persona-restyle] discarded ${persona} rewrite — assessment drifted:`, drift);
      return { text: neutralText, outcome: "assessment_drift", drift };
    }

    return { text: styled, outcome: "applied" };
  } catch (err) {
    // Never fatal. A candidate must get their debrief even if the voice they picked is unavailable.
    console.error("[persona-restyle] failed (serving the neutral text):", err);
    return { text: neutralText, outcome: "error" };
  }
}
