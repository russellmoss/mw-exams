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
