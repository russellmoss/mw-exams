"use client";

// The persona picker, shared by Settings and the post-signup onboarding screen so the two can
// never drift into describing the same four voices differently.
//
// Design: the Study Defaults radio cards it sits beside — border-defined, amber for the selected
// state, tokens only (DESIGN.md "Cellar"). The one addition is the SAMPLE line: four abstract
// descriptions of a tone are much harder to choose between than four renderings of the same
// sentence, and the samples in personas.ts are deliberately the same piece of feedback four ways.

import { useState } from "react";
import { PERSONAS, type PersonaId } from "@/lib/personas";

export function PersonaPicker({
  value,
  onChange,
  disabled,
  /**
   * Personas the account cannot use yet, with the reason. A persona voiced by an external vendor
   * needs that vendor's key, and selecting it without one would silently serve the default — which
   * looks like the setting is broken rather than unavailable.
   */
  unavailable,
}: {
  value: PersonaId;
  onChange: (id: PersonaId) => void;
  disabled?: boolean;
  unavailable?: Partial<Record<PersonaId, string>>;
}) {
  // The roast persona asks once before it is applied. Not a dark pattern and not hand-wringing:
  // the other three are self-evident from their sample, while this one is a genuine change in how
  // it will feel to read a FAIL at 11pm, and the sample undersells that on purpose (a sample is
  // one line; a debrief is forty). One tap, no modal, and never shown again once selected.
  const [confirming, setConfirming] = useState<PersonaId | null>(null);

  const pick = (id: PersonaId, edgy?: boolean) => {
    if (edgy && id !== value && confirming !== id) {
      setConfirming(id);
      return;
    }
    setConfirming(null);
    onChange(id);
  };

  return (
    <div className="space-y-3">
      {PERSONAS.map((p) => {
        const selected = value === p.id;
        const asking = confirming === p.id;
        const blocked = unavailable?.[p.id];
        return (
          <div key={p.id}>
            <button
              type="button"
              onClick={() => pick(p.id, p.edgy)}
              disabled={disabled || !!blocked}
              aria-pressed={selected}
              className={`w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                selected ? "border-accent bg-accent/10" : "border-border hover:border-muted"
              }`}
            >
              <span
                className={`w-4 h-4 mt-0.5 rounded-full border shrink-0 flex items-center justify-center ${
                  selected ? "border-accent" : "border-muted"
                }`}
              >
                {selected && <span className="w-2 h-2 rounded-full bg-accent" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-sm font-medium ${selected ? "text-accent" : "text-foreground"}`}
                  >
                    {p.name}
                  </span>
                  <span className="text-xs text-muted">{p.tagline}</span>
                  {p.edgy && (
                    <span className="text-[10px] uppercase tracking-wide rounded-md border border-borderline/50 text-borderline px-1.5 py-0.5">
                      Rude on purpose
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted mt-1 leading-relaxed">
                  {p.description}
                </span>
                {blocked && (
                  <span className="block text-xs text-borderline mt-1.5 leading-relaxed">
                    {blocked}
                  </span>
                )}
                <span className="block text-xs text-foreground/80 mt-2 pl-3 border-l-2 border-border italic leading-relaxed">
                  {p.sample}
                </span>
              </span>
            </button>

            {asking && (
              <div className="mt-2 ml-7 rounded-lg border border-borderline/40 bg-borderline/5 p-3">
                <p className="text-xs text-foreground leading-relaxed">
                  {p.warning ??
                    `${p.name} will mock your answers — specifically, and without softening it when you do badly. It never insults you personally, never tells you to give up, and it still gives you every finding and the same marks as any other voice.`}{" "}
                  Sure?
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => pick(p.id, false)}
                    disabled={disabled}
                    className="text-xs font-medium rounded-lg bg-accent/15 text-accent border border-accent/40 px-3 py-1.5 cursor-pointer hover:bg-accent/25 transition-colors disabled:opacity-60"
                  >
                    Go on then
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-xs rounded-lg border border-border text-muted px-3 py-1.5 cursor-pointer hover:text-foreground hover:border-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
