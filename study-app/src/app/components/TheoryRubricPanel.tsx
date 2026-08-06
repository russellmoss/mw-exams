"use client";

import type { RubricRequirement, TheoryRubric } from "@/lib/theory/types";

function Requirement({ requirement, core }: { requirement: RubricRequirement; core: boolean }) {
  const superseded = requirement.temporalClass === "superseded";
  const temporal = superseded
    ? "Superseded · excused"
    : requirement.temporalClass === "year_bound"
      ? "Year-bound · current substitute accepted"
      : "Evergreen · applies in full";
  return (
    <li className={`rounded-lg border p-3 ${superseded ? "border-muted/40 opacity-70" : "border-border bg-background/25"}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{core ? "Pass floor" : "Differentiator"}</span>
        <span className="text-[10px] text-accent">{temporal}</span>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{requirement.element}</p>
      <blockquote className="border-l-2 border-accent pl-3 mt-2 text-xs text-muted leading-relaxed">
        “{requirement.quote}”
      </blockquote>
      {superseded && requirement.temporalSource && (
        <a href={requirement.temporalSource.url} target="_blank" rel="noreferrer" className="inline-block text-[11px] text-accent hover:text-accent-hover underline mt-2">
          Tier-1 supersession source
        </a>
      )}
    </li>
  );
}

export function TheoryRubricPanel({ rubric }: { rubric: TheoryRubric }) {
  const activeCore = rubric.coreRequirements.filter((requirement) => requirement.temporalClass !== "superseded").length;
  return (
    <aside className="bg-card rounded-xl border border-border p-5 h-fit" aria-labelledby="theory-rubric-title">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">What you were marked against</p>
          <h2 id="theory-rubric-title" className="font-display text-xl font-semibold text-foreground mt-1">Examiner rubric</h2>
        </div>
        <span className="text-[10px] rounded-full border border-border px-2.5 py-1 text-muted whitespace-nowrap">as of {rubric.temporalAsOf}</span>
      </div>
      {rubric.exAnte && (
        <p className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-accent mb-4">
          Ex-ante question: judged from the information available in {rubric.year}, without hindsight credit.
        </p>
      )}
      {rubric.commandWord && (
        <div className="rounded-lg border border-border bg-background/30 p-3 mb-4">
          <p className="text-xs text-muted">Command word</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{rubric.commandWord}</p>
          {rubric.commandWordDemand && <p className="text-xs text-muted leading-relaxed mt-1">{rubric.commandWordDemand}</p>}
        </div>
      )}
      {rubric.definitionsRequired.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Definitions expected</h3>
          <ul className="space-y-2">
            {rubric.definitionsRequired.map((definition) => (
              <li key={definition.term} className="text-sm text-foreground"><strong>{definition.term}</strong><span className="block text-xs text-muted mt-0.5">“{definition.quote}”</span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Core requirements ({activeCore} active)</h3>
        <ul className="space-y-2">
          {rubric.coreRequirements.map((requirement) => <Requirement key={requirement.element} requirement={requirement} core />)}
          {!rubric.coreRequirements.length && <li className="text-xs text-muted">The report states no explicit pass-floor checklist for this question.</li>}
        </ul>
      </div>
      {rubric.differentiators.length > 0 && (
        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">Differentiators ({rubric.differentiators.length})</summary>
          <ul className="space-y-2 mt-3">
            {rubric.differentiators.map((requirement) => <Requirement key={requirement.element} requirement={requirement} core={false} />)}
          </ul>
        </details>
      )}
      {rubric.scopeTraps.length > 0 && (
        <details className="border-t border-border pt-3 mt-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">Scope traps ({rubric.scopeTraps.length})</summary>
          <ul className="list-disc ml-4 mt-2 space-y-1 text-xs text-muted">
            {rubric.scopeTraps.map((trap) => <li key={trap.trap}>{trap.trap}</li>)}
          </ul>
        </details>
      )}
      <p className="border-t border-border pt-3 mt-4 text-[11px] text-muted leading-relaxed">
        This rubric is examiner-derived. The verdict is indicative, not a calibrated mark against real scripts.
      </p>
    </aside>
  );
}
