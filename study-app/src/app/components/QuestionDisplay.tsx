"use client";

import type { Question } from "@/lib/study-session";
import { STEM_DETAIL_META, type StemDetailLevel } from "@/lib/prompts/stemDetail";
import { StemDetailBadge } from "./StemDetailControl";
import { deriveQuestion, markPhrase } from "@/lib/question-sections";
import { QuestionSectionCards } from "./QuestionSectionCards";

interface QuestionDisplayProps {
  question: Question;
  onStartReasoning: () => void;
  onGenerateFresh?: () => void;
  isGenerating?: boolean;
  /** Practice mode — "known-wine" reveals identities up front and skips stem analysis. */
  mode?: "full" | "stem-only" | "known-wine";
  /**
   * Stem Detail: the stem prose to actually render, already resolved for the candidate's chosen
   * level. Defaults to the canonical `question.text` so callers that don't use the dial are
   * unaffected. Sub-questions and marks are identical across levels — only the preamble changes.
   */
  stemText?: string;
  /** The level currently being shown (drives the badge). Omit to hide the badge entirely. */
  stemDetailLevel?: StemDetailLevel;
  /** The level the candidate started at, if they have since escalated (renders "IMW Only → Guided"). */
  stemDetailStartedAt?: StemDetailLevel | null;
  /** The level "Add detail" would move to, or null when already at the most-detailed level. */
  nextStemDetailLevel?: StemDetailLevel | null;
  onAddDetail?: () => void;
}

export function QuestionDisplay({
  question,
  onStartReasoning,
  onGenerateFresh,
  isGenerating,
  mode = "full",
  stemText,
  stemDetailLevel,
  stemDetailStartedAt,
  nextStemDetailLevel,
  onAddDetail,
}: QuestionDisplayProps) {
  const knownWine = mode === "known-wine";
  const paperLabel =
    question.paper === 1
      ? "Paper 1 — Whites"
      : question.paper === 2
        ? "Paper 2 — Reds"
        : "Paper 3 — Special";

  // Render the level-resolved stem when one is supplied, else the canonical text. Split Sections:
  // derive scope-tagged sub-parts once and group them. A question spanning >1 scope renders the two
  // labelled section cards; a single-scope question keeps the flat lettered list exactly as before.
  const wineCount = question.wines.length;
  const derived = deriveQuestion(stemText ?? question.text, wineCount);
  const multiScope = derived.scopes.length > 1;

  /**
   * The footer total comes from the QUESTION, not from the stem prose.
   *
   * `derived.totalMarks` is scraped from a literal "Total: N marks" line in the stem, and that line is
   * LLM-authored: the Stem Detail derivation prompt used to demand a Total line even when the
   * canonical stem had none, so the model invented one and sometimes got it wrong. gen_p2_F5_
   * 1786049788105 printed "Total: 44 marks" over sub-parts summing to 50 — 44 being the "For each
   * wine" parts (10+16+18) with the flight-wide 6 for part (a) dropped. Measured across the bank: 62
   * questions carry an invented total line (the canonical prints one on only 3), and 19 of those
   * disagree with their own total_marks. Reported from the Coach, attempt 407.
   *
   * `question.totalMarks` is the authoritative column, hard-validated as flightSize x 25
   * (question-rules.mjs "marks"), and is what the header badge already shows — so trusting it here
   * also stops the two totals on one screen from contradicting each other.
   *
   * Still GATED on the stem having declared a total, so this fixes the number without adding a footer
   * to the ~790 questions that never showed one. The scraped value survives only as a fallback for a
   * caller with no authoritative total.
   */
  const declaresTotal = derived.totalMarks != null;
  const footerTotal = question.totalMarks > 0 ? question.totalMarks : derived.totalMarks;

  return (
    <div>
      {/* Header badges */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-accent/15 text-accent border border-accent/20">
          {paperLabel}
        </span>
        <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-card text-muted border border-border">
          {question.familyLabel}
        </span>
        <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-card text-muted border border-border">
          {question.totalMarks} marks
        </span>
        {stemDetailLevel && (
          <StemDetailBadge level={stemDetailLevel} escalatedFrom={stemDetailStartedAt} />
        )}
      </div>

      {/* Question card */}
      <div className={`bg-card rounded-2xl border border-border overflow-hidden ${multiScope ? "mb-4" : "mb-8"}`}>
        {/* Preamble */}
        <div className="px-8 pt-8 pb-6">
          <p className="text-lg text-foreground leading-relaxed font-medium">
            {derived.preamble}
          </p>
        </div>

        {/* Single-scope: flat lettered list exactly as before (only the per-wine mark phrasing now
            spells out the flight-wide total). Mixed-scope questions render the section cards below. */}
        {!multiScope && derived.subParts.length > 0 && (
          <div className="border-t border-border/50">
            {derived.subParts.map((sq, i) => (
              <div
                key={sq.label}
                className={`px-8 py-5 flex gap-4 ${
                  i < derived.subParts.length - 1
                    ? "border-b border-border/30"
                    : ""
                }`}
              >
                <span className="text-accent font-mono text-sm font-semibold shrink-0 mt-0.5">
                  {sq.label})
                </span>
                <div className="flex-1">
                  <p className="text-[15px] text-foreground/90 leading-relaxed">
                    {sq.text}
                  </p>
                </div>
                {sq.marks > 0 && (
                  <span className="text-xs text-muted font-mono shrink-0 mt-0.5 whitespace-nowrap tabular-nums">
                    {markPhrase(sq, wineCount)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add detail + total footer live inside the question card only in the flat layout; in the
            mixed-scope layout they trail the section cards below. */}
        {!multiScope && onAddDetail && nextStemDetailLevel && (
          <div className="px-8 py-4 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Stuck? Reveal how the flight is organised — the wines, marks and grading don&apos;t change.
            </p>
            <button
              onClick={onAddDetail}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors cursor-pointer shrink-0"
            >
              Add detail → {STEM_DETAIL_META[nextStemDetailLevel].name}
            </button>
          </div>
        )}

        {!multiScope && declaresTotal && (
          <div className="px-8 py-3 bg-border/10 border-t border-border/50">
            <p className="text-xs text-muted font-mono text-right tabular-nums">
              Total: {footerTotal} marks
            </p>
          </div>
        )}
      </div>

      {/* Mixed-scope: two bordered section cards (flight → per_wine), then the shared add-detail /
          total footer that lives inside the card in the flat layout. */}
      {multiScope && (
        <>
          <QuestionSectionCards sections={derived.sections} wineCount={wineCount} />
          {(onAddDetail && nextStemDetailLevel) || declaresTotal ? (
            <div className="bg-card rounded-xl border border-border overflow-hidden mb-8">
              {onAddDetail && nextStemDetailLevel && (
                <div className="px-8 py-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted">
                    Stuck? Reveal how the flight is organised — the wines, marks and grading don&apos;t change.
                  </p>
                  <button
                    onClick={onAddDetail}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors cursor-pointer shrink-0"
                  >
                    Add detail → {STEM_DETAIL_META[nextStemDetailLevel].name}
                  </button>
                </div>
              )}
              {declaresTotal && (
                <div className="px-8 py-3 bg-border/10 border-t border-border/50">
                  <p className="text-xs text-muted font-mono text-right tabular-nums">
                    Total: {footerTotal} marks
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Wine count indicator */}
      <div className="bg-card/50 rounded-xl border border-border/50 p-5 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            {question.wines.map((w) => (
              <div
                key={w.slot}
                className="w-4 h-7 rounded-sm bg-accent/10 border border-accent/20"
                title={`Wine ${w.slot}`}
              />
            ))}
          </div>
          <span className="text-sm text-muted">
            {question.wines.length}{" "}
            {question.wines.length === 1 ? "wine" : "wines"} in this flight —
            {knownWine
              ? " identities revealed below (Dry Notes)"
              : " identities hidden until after your stem analysis"}
          </span>
        </div>

        {/* Known-Wine Write-Up: reveal the identities up front so the candidate writes to a
            known target — no identification gamble (graded on write-up quality only). */}
        {knownWine && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <p className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">
              The Wines (revealed)
            </p>
            <div className="space-y-1.5">
              {question.wines.map((w) => (
                <div key={w.slot} className="flex gap-2 text-sm">
                  <span className="text-muted font-mono shrink-0">{w.slot}.</span>
                  <span className="text-foreground/90">{w.fullText}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Visual appearance cues for Paper 3 */}
        {question.paper === 3 && question.wines.some((w) => w.appearance) && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <p className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">
              Visual Appearance
            </p>
            <div className="space-y-1.5">
              {question.wines.map((w) =>
                w.appearance ? (
                  <div key={w.slot} className="flex gap-2 text-sm">
                    <span className="text-muted font-mono shrink-0">
                      {w.slot}.
                    </span>
                    <span className="text-foreground/80">{w.appearance}</span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onStartReasoning}
          className="px-10 py-3.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-xl transition-colors duration-200 cursor-pointer text-[15px]"
        >
          {knownWine ? "Begin Write-Up" : "Begin Stem Analysis"}
        </button>
        {onGenerateFresh && (
          <button
            onClick={onGenerateFresh}
            disabled={isGenerating}
            className="text-sm text-muted hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Skip — generate a fresh question instead"}
          </button>
        )}
      </div>
    </div>
  );
}
