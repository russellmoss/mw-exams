// bin-reason-digest.ts — SOFT feed-forward (spec §4).
//
// When an admin bins a generated question with a stated reason, we don't just drop it — the next
// generation batch for that paper gets a compact digest of the most recent bin reasons so the model
// stops re-making the same faults. This is a NUDGE, not a hard rule (the mechanical validator handles
// contradiction-class faults); it is appended after the hard scope constraints so it can never
// override paper scope. Capped at ~800 tokens (~3200 chars) to stay cheap.

import { BIN_REASON_LABELS } from "@/lib/bin-reasons";

interface BinReasonRow {
  tags: string[];
  note: string | null;
}

const CHAR_CAP = 3200; // ~800 tokens

// Build the "Previously rejected — avoid these faults" block from recent bin reasons, or "" when
// there's nothing worth saying. Tags are deduped and counted; notes are deduped (case-insensitive)
// and listed newest-first until the char cap is hit.
export function buildBinReasonDigest(paper: number, reasons: BinReasonRow[]): string {
  if (!reasons || reasons.length === 0) return "";

  const tagCounts = new Map<string, number>();
  for (const r of reasons) {
    for (const t of r.tags || []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  const seenNotes = new Set<string>();
  const notes: string[] = [];
  for (const r of reasons) {
    const n = (r.note || "").trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seenNotes.has(key)) continue;
    seenNotes.add(key);
    notes.push(n);
  }

  if (tagCounts.size === 0 && notes.length === 0) return "";

  const tagLines = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => `- ${BIN_REASON_LABELS[tag] || tag} (${count})`);

  let block = `

## PREVIOUSLY REJECTED — AVOID THESE FAULTS (Paper ${paper})
A reviewer binned recent questions for the reasons below. These are the faults candidates should NOT see again — do not reproduce them in this question. This is guidance, never a licence to break paper scope above.`;

  if (tagLines.length > 0) {
    block += `

Most common faults:
${tagLines.join("\n")}`;
  }

  if (notes.length > 0) {
    block += `

Reviewer notes:`;
    for (const n of notes) {
      const line = `\n- ${n}`;
      if (block.length + line.length > CHAR_CAP) break;
      block += line;
    }
  }

  return block.slice(0, CHAR_CAP);
}
