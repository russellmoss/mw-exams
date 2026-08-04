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
