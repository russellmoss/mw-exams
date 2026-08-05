// Batch Undo — the reviewed / never-reviewed pill, rendered on every bank item (the Fill-the-Bank
// review queue and the Bank Health item lists). Never exposes internal state names.
//
//   Reviewed        — an admin explicitly kept this item: amber text + check.
//   Never reviewed  — reached the bank without review (auto-keep): muted stone border + grey text.
export function BankReviewBadge({ reviewed }: { reviewed: boolean }) {
  if (reviewed) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-accent/40 text-accent">
        <span aria-hidden>✓</span> Reviewed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border border-border text-muted">
      Never reviewed
    </span>
  );
}

// Length Check (feature) — the review-card chip surfacing the auto-repair verdict. Two variants:
//   'trimmed' — amber outlined "Trimmed"   (the item ran long and was auto-repaired once).
//   'over'    — red outlined "Runs long"   (still over after one repair; admin decides).
// Nothing renders for 'clean' or NULL. The chip is a BUTTON: clicking it toggles the inline "Length
// check" panel beneath the question text (owned by the review card), so it takes onClick + open state.
export function LengthCheckChip({
  status,
  open,
  onClick,
}: {
  status: "trimmed" | "over" | "clean" | null | undefined;
  open: boolean;
  onClick: () => void;
}) {
  if (status !== "trimmed" && status !== "over") return null;
  const trimmed = status === "trimmed";
  const label = trimmed ? "Trimmed" : "Runs long";
  const tone = trimmed
    ? "border-accent/60 text-accent hover:bg-accent/10"
    : "border-fail/60 text-fail hover:bg-fail/10";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${tone} ${
        open ? (trimmed ? "bg-accent/10" : "bg-fail/10") : ""
      }`}
    >
      {label}
      <span aria-hidden className="text-[9px]">{open ? "▲" : "▼"}</span>
    </button>
  );
}

/**
 * Answer Length (migration 039) — the model ANSWER's word-budget verdict, the counterpart of
 * LengthCheckChip above (which is about the question STEM).
 *
 * Both chips can sit on the same card, so the labels say "Answer …" rather than reusing the stem's
 * bare "Trimmed" / "Runs long" — otherwise a reviewer cannot tell which artifact is being flagged.
 *
 * Tone follows the stem chip's logic, not the verdict palette: amber = the system fixed it and you
 * may want to see what it did; red = it is still off budget and needs a human. `under` is red for the
 * same reason `over` is — an answer too thin for the marks on offer is as wrong as a bloated one, and
 * on a six-wine flight it is the more likely failure.
 */
export function AnswerLengthChip({
  status,
  words,
  open,
  onClick,
}: {
  status: "clean" | "corrected" | "over" | "under" | null | undefined;
  words: number | null | undefined;
  open: boolean;
  onClick: () => void;
}) {
  if (status !== "corrected" && status !== "over" && status !== "under") return null;
  const corrected = status === "corrected";
  const label =
    status === "corrected" ? "Answer rewritten" : status === "over" ? "Answer runs long" : "Answer runs short";
  const tone = corrected
    ? "border-accent/60 text-accent hover:bg-accent/10"
    : "border-fail/60 text-fail hover:bg-fail/10";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${tone} ${
        open ? (corrected ? "bg-accent/10" : "bg-fail/10") : ""
      }`}
    >
      {label}
      {typeof words === "number" && <span className="tabular-nums opacity-80">{words}w</span>}
      <span aria-hidden className="text-[9px]">{open ? "▲" : "▼"}</span>
    </button>
  );
}
