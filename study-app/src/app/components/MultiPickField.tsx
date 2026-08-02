"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  placeholder: string; // muted empty-state text ("Select grape" / "Select country")
  options: string[]; // canonical option list (the same source the single-value pickers use)
  value: string[]; // currently selected values
  onChange: (next: string[]) => void;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * MultiPickField — the shared multi-select control behind Multi-Pick Predictions.
 * A flat bordered trigger opens a bordered dropdown with a search box and checkbox rows; selected
 * values sort to the top and render as removable amber pills beneath the trigger. No selection cap.
 * Keyboard: type to filter, Enter toggles the top match, Esc closes; click-outside closes.
 */
export function MultiPickField({ placeholder, options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPanel = () => {
    setQuery("");
    setOpen(true);
  };
  const closePanel = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const isSelected = (o: string) => value.some((v) => eq(v, o));

  // Filter by the search box, then float selected options to the top (stable within each group).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options.slice();
    return list.sort((a, b) => (isSelected(a) ? 0 : 1) - (isSelected(b) ? 0 : 1) || a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query, value]);

  const toggle = (o: string) =>
    onChange(isSelected(o) ? value.filter((v) => !eq(v, o)) : [...value, o]);
  const remove = (o: string) => onChange(value.filter((v) => v !== o));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[0]) toggle(filtered[0]);
    }
  };

  const summary =
    value.length <= 2 ? value.join(", ") : `${value.slice(0, 2).join(", ")} +${value.length - 2}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        className="w-full flex items-center justify-between gap-2 bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-left transition-colors hover:border-muted focus:outline-none focus:border-accent/60 cursor-pointer"
      >
        <span className={`truncate ${value.length ? "text-foreground" : "text-muted"}`}>
          {value.length ? summary : placeholder}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`w-4 h-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg overflow-hidden flex flex-col max-h-[280px]">
          <div className="p-2 border-b border-border shrink-0">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search…"
              className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-accent/60"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">No matches</div>
            ) : (
              filtered.map((o) => {
                const on = isSelected(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggle(o)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-card-hover transition-colors cursor-pointer"
                  >
                    <span
                      className={`w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 ${
                        on ? "bg-accent border-accent text-background" : "border-border"
                      }`}
                      aria-hidden
                    >
                      {on ? (
                        <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="text-foreground">{o}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs bg-accent/15 text-accent border border-accent/40"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                title={`Remove ${v}`}
                className="text-accent/70 hover:text-accent-hover transition-colors cursor-pointer leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
