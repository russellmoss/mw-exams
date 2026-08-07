// Deterministic post-turn guards.
//
// These exist because the failure they catch is invisible to the candidate. A Coach that says
// "Semillon has never appeared in a Paper 1 single-variety flight" without having looked is
// indistinguishable, in the moment, from one that checked — and the candidate will revise around it.
// Prompt instructions reduce that; they do not eliminate it. A guard that fires on the text itself
// does.
//
// Deliberately conservative: both guards look for a STRONG claim, not a hedge. "I don't think that
// has come up" is a stated opinion and passes. "That has never appeared" is an assertion of fact
// about a corpus, and must be backed by a scan of it.

import { ALL_CITABLE_DOMAINS } from "./sources";

/** Absolute claims about the corpus. Present tense and past perfect, positive and negative. */
const ABSOLUTE_CORPUS_CLAIM =
  /\b(has never (?:been |appeared|come up|featured)|have never (?:been|appeared|come up|featured)|never appeared|no (?:past |real )?(?:exam|paper|question) has|has always (?:been|featured)|always appears|every (?:single )?year|in every paper|not once)\b/i;

/** Hedges that turn an assertion back into an opinion. */
const HEDGED = /\b(i think|i believe|i'?m not sure|as far as i (?:know|recall)|from memory|off the top of my head|i'?d guess|probably|might never)\b/i;

const CORPUS_TOOLS = new Set(["query_corpus"]);

/**
 * The three confidence tiers, matched ONLY in their uppercase label form.
 *
 * Case-sensitivity is the whole trick. "that's a plausible read" is ordinary English and must not
 * fire; "PLAUSIBLE" is a claim about where this ruling sits in the evidence hierarchy, and the
 * candidate will weight their revision by it. Matching the lowercase word would make this guard
 * unusable — it appears constantly in normal wine talk.
 */
const TIER_LABEL = /\b(STRONG SIGNAL|PLAUSIBLE|CURVEBALL)\b/;

/** Both carry real tiers: EK rulings are tiered at source, and the trees label their branches. */
const TIER_TOOLS = new Set(["query_empirical_knowledge", "get_decision_tree"]);

export interface GuardResult {
  /** Text to append to the reply, or null when the turn is clean. */
  correction: string | null;
  /** Short machine label for telemetry. */
  code: string | null;
}

/**
 * Did the reply assert that something never/always happens in the real exam without scanning it?
 */
export function citationGuard(text: string, toolsUsed: string[]): GuardResult {
  if (!ABSOLUTE_CORPUS_CLAIM.test(text)) return { correction: null, code: null };
  if (HEDGED.test(text)) return { correction: null, code: null };
  if (toolsUsed.some((t) => CORPUS_TOOLS.has(t))) return { correction: null, code: null };

  return {
    code: "uncited_absolute_claim",
    correction:
      "\n\n---\n\n**Correction from the app:** I made a claim above about what has or has not appeared " +
      "in a real MW paper without actually searching the past-paper corpus. Treat that claim as " +
      "unverified — ask me to check it and I will scan all 162 real questions properly.",
  };
}

/**
 * Did the reply assign a confidence tier without consulting a tiered source?
 *
 * Observed in testing: the Coach searched the past papers, then wrote "STRONG SIGNAL that this
 * recurs" — borrowing the vocabulary of the evidence hierarchy to dress up its own impression. That
 * is worse than an ordinary hedge, because the whole point of the tiers is that they are *earned*
 * from the corpus, and a candidate reading STRONG SIGNAL will revise as though it were.
 */
export function tierGuard(text: string, toolsUsed: string[]): GuardResult {
  if (!TIER_LABEL.test(text)) return { correction: null, code: null };
  if (toolsUsed.some((t) => TIER_TOOLS.has(t))) return { correction: null, code: null };

  return {
    code: "unbacked_tier_claim",
    correction:
      "\n\n---\n\n**Correction from the app:** I used a confidence tier (STRONG SIGNAL / PLAUSIBLE / " +
      "CURVEBALL) above without checking a tiered source. Those tiers are earned from the empirical " +
      "knowledge base and the decision trees, not from my impression — read that as my own read, and " +
      "ask me to check the tier properly if it matters.",
  };
}

/**
 * Did a web-sourced reply forget to cite?
 *
 * The tier-1 restriction guarantees the SOURCE is good; it does nothing to guarantee the candidate
 * is told what it was. An uncited claim from the web is indistinguishable, to the reader, from the
 * model's own recollection — and this is exactly the material they might repeat in an exam answer,
 * where an unattributed assertion earns nothing.
 *
 * Deliberately loose about the form: a bare URL, a markdown link or the publisher's domain in prose
 * all count. The guard is checking that attribution HAPPENED, not policing its style.
 */
export function webCitationGuard(text: string, toolsUsed: string[]): GuardResult {
  if (!toolsUsed.includes("search_wine_web")) return { correction: null, code: null };

  const hasLink = /https?:\/\/\S+/.test(text);
  // Citable, not tier-1: a Wikipedia fallback still has to be attributed — arguably more so, since
  // the answer must also say it is a fallback.
  const hasDomain = new RegExp(
    `\\b(${ALL_CITABLE_DOMAINS.map((d) => d.replace(/\./g, "\\.")).join("|")})\\b`,
    "i"
  ).test(text);
  if (hasLink || hasDomain) return { correction: null, code: null };

  return {
    code: "uncited_web_claim",
    correction:
      "\n\n---\n\n**Correction from the app:** I searched the web for that but did not cite what I " +
      "found. Ask me for the sources — anything above that came from a search should be attributed " +
      "to a named publisher before you rely on it, let alone repeat it in an exam answer.",
  };
}

/**
 * Did the reply claim an action was taken when nothing was committed?
 *
 * With write tools live, this is the guard that keeps the confirmation flow honest. Raising a card
 * is NOT committing: the candidate still has to press Confirm. A model that says "I've filed that"
 * when a card is merely sitting there has told them the opposite of the truth, and they will stop
 * looking at the card.
 */
const ACTION_CLAIM =
  /\b(i(?:'ve| have)? (?:now )?(?:built|created|started|launched|filed|submitted|reported|saved|scheduled|set up|booked)|(?:has|have) been (?:created|filed|submitted|saved|launched|started)|i'?ll go ahead and (?:build|create|file|submit|start))\b/i;

export function overclaimGuard(text: string, committed: boolean): GuardResult {
  if (committed) return { correction: null, code: null };
  if (!ACTION_CLAIM.test(text)) return { correction: null, code: null };

  return {
    code: "overclaimed_action",
    correction:
      "\n\n---\n\n**Correction from the app:** nothing has actually been sent yet. If there's a " +
      "confirmation card above, it is still waiting on you — press Confirm and it happens; ignore it " +
      "and it doesn't. Anything above that sounded like a completed action has not occurred.",
  };
}

/** Run every guard, returning the concatenated corrections and the codes that fired. */
export function runGuards(opts: {
  text: string;
  toolsUsed: string[];
  committed: boolean;
}): { text: string; codes: string[] } {
  const results = [
    citationGuard(opts.text, opts.toolsUsed),
    tierGuard(opts.text, opts.toolsUsed),
    webCitationGuard(opts.text, opts.toolsUsed),
    overclaimGuard(opts.text, opts.committed),
  ];
  const codes = results.map((r) => r.code).filter((c): c is string => !!c);
  const corrections = results.map((r) => r.correction).filter((c): c is string => !!c);
  return { text: opts.text + corrections.join(""), codes };
}
