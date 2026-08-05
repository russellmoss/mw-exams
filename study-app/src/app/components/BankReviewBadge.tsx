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
