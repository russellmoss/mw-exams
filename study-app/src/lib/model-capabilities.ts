// model-capabilities.ts — pure, dependency-free facts about model ids.
//
// Split out of thinking-stream.ts so that modules which only need to ASK "does this model reason?"
// don't have to import an SSE/streaming module that reaches into app_settings and the database.
// prompts/model-answer-prompt.ts is the case that forced it: it sizes max_tokens from this predicate
// and is imported by the offline scripts (regen-model-answers.mjs, remediate-questions.mjs) through
// the TS loader, where dragging in the settings/db chain is both unnecessary and fragile.
//
// Nothing here may import anything. thinking-stream.ts re-exports supportsAdaptiveThinking so every
// existing importer is unaffected.

/**
 * Models that accept `thinking: {type:"adaptive"}`. Deliberately an allow-list of exact ids rather
 * than a loose /opus/ match: adaptive thinking is Opus 4.6+ / Sonnet 4.6+ only, and sending it to
 * Haiku 4.5 (or an older Opus resolved by getLatestOpus) is a 400 that would kill the generation.
 *
 * Also the right predicate for SIZING `max_tokens`, which caps thinking and response together. Note
 * the two are not the same question: this list is a superset of the models that reason BY DEFAULT
 * (Opus 4.7+ / Sonnet 5 do; Opus 4.6 / Sonnet 4.6 reason only when asked). For sizing that asymmetry
 * is the safe direction — over-sizing a model that stays quiet costs nothing, because billing is per
 * token emitted rather than per cap, while under-sizing one that reasons costs the entire call.
 */
export function supportsAdaptiveThinking(model: string): boolean {
  return /^claude-(opus-(4-6|4-7|4-8|5)|sonnet-(4-6|5)|fable-5|mythos-5)\b/.test(model);
}

/**
 * Models that reason BY DEFAULT — a strict subset of supportsAdaptiveThinking, which also matches
 * Opus 4.6 / Sonnet 4.6, models that reason only when a request asks them to.
 *
 * The distinction is behavioural, not cosmetic. On a default reasoner, requesting the summarized
 * display only makes visible what the model was already going to do; the tokens were being spent
 * either way. On a request-only reasoner the same request CHANGES what the model does — and on the
 * generation prompt Sonnet 4.6 sometimes answered that request with a thinking spiral, consuming
 * the entire 16,000-token output budget with zero text (11 generation_attempts rows on
 * 2026-08-05/06: ~280s each, stop_reason=max_tokens, blocks=[thinking]). Callers deciding whether
 * to ASK for thinking should gate on this predicate; callers sizing max_tokens should keep using
 * supportsAdaptiveThinking, where over-matching is the safe direction.
 */
export function reasonsByDefault(model: string): boolean {
  return /^claude-(opus-(4-7|4-8|5)|sonnet-5|fable-5|mythos-5)\b/.test(model);
}
