"use client";

import { useState } from "react";
import { BIN_REASON_OPTIONS, MAX_BIN_NOTE_CHARS } from "@/lib/bin-reasons";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BinReasonChips — the OPTIONAL, non-blocking reason capture that lives beneath the Undo bar (spec §3).
//
// The bin has ALREADY happened by the time this renders. Tapping a chip (or submitting the "Other…"
// free-text) fires a separate, fire-and-forget PATCH that attaches the reason to every item still in
// the Undo window (`itemIds`). It must NEVER surface as a bin failure: a failed attach shows at most a
// small grey "Reason not saved" note and nothing else. Cellar look: small bordered pills — unselected
// = border + muted text, selected = amber border + amber text.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const OTHER = "__other__";

interface BinReasonChipsProps {
  // The bank item ids currently inside the Undo window — the reason attaches to all of them.
  itemIds: string[];
}

export function BinReasonChips({ itemIds }: BinReasonChipsProps) {
  // Selected fault tags (multi-select). "Other…" toggles the free-text field rather than adding a tag.
  const [tags, setTags] = useState<string[]>([]);
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<null | "saving" | "saved" | "failed">(null);

  // Fire-and-forget: attach the current (tags, note) to every binned item. Failure is swallowed to a
  // grey "Reason not saved" note — it must never read as a bin failure.
  const send = (nextTags: string[], nextNote: string) => {
    const cleanNote = nextNote.trim();
    if (nextTags.length === 0 && cleanNote.length === 0) {
      setStatus(null);
      return;
    }
    setStatus("saving");
    fetch("/api/admin/fill-bank/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds, reasons: nextTags, note: cleanNote || null }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setStatus("saved");
      })
      .catch((err) => {
        console.error("[fill-bank] reason attach failed (non-fatal):", err);
        setStatus("failed");
      });
  };

  const toggleTag = (value: string) => {
    const next = tags.includes(value) ? tags.filter((t) => t !== value) : [...tags, value];
    setTags(next);
    send(next, note);
  };

  const toggleOther = () => {
    const open = !otherOpen;
    setOtherOpen(open);
    if (!open) {
      // Closing "Other…" clears the note and re-sends the remaining tags (or resets if none).
      setNote("");
      send(tags, "");
    }
  };

  const submitNote = () => {
    if (note.trim().length === 0) return;
    send(tags, note);
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Why? (optional)</p>
      <div className="flex flex-wrap gap-2">
        {BIN_REASON_OPTIONS.map((opt) => {
          const on = tags.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggleTag(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                on
                  ? "border-accent text-accent"
                  : "border-border text-muted hover:border-muted hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {/* "Other…" — reveals a single-line free-text input rather than adding a tag. */}
        <button
          key={OTHER}
          type="button"
          aria-pressed={otherOpen}
          onClick={toggleOther}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
            otherOpen
              ? "border-accent text-accent"
              : "border-border text-muted hover:border-muted hover:text-foreground"
          }`}
        >
          Other…
        </button>
      </div>

      {otherOpen && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={note}
            maxLength={MAX_BIN_NOTE_CHARS}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNote();
              }
            }}
            placeholder="What was wrong?"
            aria-label="Other reason"
            className="flex-1 text-sm px-3 py-1.5 bg-background/40 border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={submitNote}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:border-muted transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      )}

      {/* A failed attach is a silent grey note — never a bin failure. */}
      {status === "failed" && <p className="text-[11px] text-muted mt-2">Reason not saved</p>}
    </div>
  );
}
