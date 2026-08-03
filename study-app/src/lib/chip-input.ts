/**
 * Commit decisions for the Stem Sniper chip inputs.
 *
 * These live outside the component so they can be unit tested without a DOM (the suite has no
 * jsdom). Both answer the same question from a different event: "should this interaction turn the
 * pending text into a chip?"
 *
 * The card's own shortcuts — Enter = add wine, Ctrl/⌘+Enter = submit — must survive untouched, so
 * the guards below are deliberately narrow. Stem Sniper is a speed drill; the entry rhythm is
 * muscle memory and changing it costs the candidate more than the bug does.
 */

/**
 * True when a keydown should commit the pending text as a chip.
 *
 * Only in multi mode, only for a bare Enter, and only with non-blank text. Ctrl/⌘+Enter is ruled
 * out first so submit is never swallowed, and Enter on an empty field falls through to "add wine".
 */
export function shouldCommitOnEnter(opts: {
  multi: boolean;
  key: string;
  pending: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): boolean {
  if (!opts.multi) return false;
  if (opts.key !== "Enter") return false;
  if (opts.metaKey || opts.ctrlKey) return false;
  return opts.pending.trim().length > 0;
}

/**
 * True when a change event is a <datalist> selection rather than typing.
 *
 * Browsers report a datalist pick as an input event with no `inputType`, while typing yields
 * "insertText" and pasting "insertFromPaste". That signal alone is browser-dependent, so an exact
 * (case-insensitive) match against the option list is required as well — which means a half-typed
 * word can never be committed out from under the candidate even if a browser reports oddly.
 */
export function isDatalistCommit(opts: {
  multi: boolean;
  value: string;
  inputType?: string;
  options: readonly string[];
}): boolean {
  if (!opts.multi) return false;
  if (opts.inputType !== undefined) return false;
  const v = opts.value.trim().toLowerCase();
  if (!v) return false;
  return opts.options.some((o) => o.trim().toLowerCase() === v);
}
