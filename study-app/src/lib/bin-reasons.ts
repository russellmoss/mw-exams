// bin-reasons.ts — the single source of truth for "Bin with a Reason" fault tags.
//
// Shared by the Fill-the-Bank review UI (the chip row), the review/bin API (validation of incoming
// tags), the soft feed-forward digest, and the "Learned from your bins" line. Keep the option order —
// the chip row renders in this order.

export interface BinReasonOption {
  value: string;
  label: string;
}

// The one-tap fault chips shown BELOW the Undo bar after a bin (spec §3). Order is the render order.
// "Other…" is NOT in this list — it is a UI affordance that reveals the free-text note, stored as
// reason_note rather than a tag. Values are stable short-codes; labels are candidate-neutral English.
export const BIN_REASON_OPTIONS: readonly BinReasonOption[] = [
  { value: "stem_mismatch", label: "Wines don't match the stem" },
  { value: "flight_samey", label: "Flight too samey" },
  { value: "wrong_marks", label: "Marks look wrong" },
  { value: "quality_narrow", label: "Quality spread too narrow" },
  { value: "factual_error", label: "Factual error" },
  { value: "too_easy", label: "Too easy" },
  { value: "too_hard", label: "Too hard" },
] as const;

export const BIN_REASON_LABELS: Record<string, string> = Object.fromEntries(
  BIN_REASON_OPTIONS.map((o) => [o.value, o.label])
);

// Tags that name a CONTRADICTION-class fault the hard validator is meant to catch mechanically. When a
// bin carries one of these, we log it against the validator so a gap (a fault the validator missed) is
// visible in the logs. Mirrors §4 HARD of the spec.
export const VALIDATOR_LINKED_TAGS = ["stem_mismatch", "wrong_marks"] as const;

export const MAX_BIN_NOTE_CHARS = 500;

// Keep only recognised tags (defensive against a stale/hand-crafted client payload).
export function sanitizeBinTags(tags: unknown): string[] | null {
  if (!Array.isArray(tags)) return null;
  const known = new Set(BIN_REASON_OPTIONS.map((o) => o.value));
  const out = tags.filter((t): t is string => typeof t === "string" && known.has(t));
  return out.length > 0 ? Array.from(new Set(out)) : null;
}

export function sanitizeBinNote(note: unknown): string | null {
  if (typeof note !== "string") return null;
  const trimmed = note.trim().slice(0, MAX_BIN_NOTE_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}
