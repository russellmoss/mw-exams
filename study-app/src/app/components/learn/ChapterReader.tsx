"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Chapter } from "@/lib/learning-units";
import { Block } from "./Block";

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string>(ids[0] ?? "");
  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // trip when a heading is in the upper third of the viewport
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") return null;
  return (
    <span className="text-[0.65rem] uppercase tracking-wide text-borderline border border-borderline/40 rounded-full px-2 py-0.5">
      {status}
    </span>
  );
}

export function ChapterReader({ chapter }: { chapter: Chapter }) {
  const sectionIds = chapter.sections.map((s) => s.id);
  const active = useScrollSpy(sectionIds);
  const strengthCited = chapter.citations.filter((c) => c.source);

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/learn" className="text-xs text-muted hover:text-accent transition-colors">
              ← Learn
            </Link>
            <span className="text-xs text-muted tabular-nums">Chapter {chapter.chapter}</span>
            <StatusBadge status={chapter.status} />
            {chapter.estReadingMinutes && (
              <span className="text-xs text-muted">≈ {chapter.estReadingMinutes} min</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{chapter.title}</h1>
          {chapter.subtitle && <p className="text-sm text-muted mt-1">{chapter.subtitle}</p>}
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-8 lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
          {/* TOC */}
          <aside className="hidden lg:block">
            <nav className="sticky top-6 space-y-1">
              <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted mb-3">
                On this page
              </div>
              {chapter.sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`block text-sm py-1 leading-snug transition-colors border-l-2 pl-3 -ml-px ${
                    active === s.id
                      ? "text-accent border-accent"
                      : "text-muted border-transparent hover:text-foreground"
                  }`}
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          {/* Body */}
          <article className="min-w-0">
            {/* Summary */}
            <p className="text-base text-foreground/80 leading-relaxed border-l-2 border-border pl-4 mb-8">
              {chapter.summary}
            </p>

            {/* Mobile TOC */}
            <details className="lg:hidden mb-8 rounded-lg border border-border bg-card p-3">
              <summary className="text-sm font-medium text-foreground cursor-pointer">Contents</summary>
              <div className="mt-2 space-y-1">
                {chapter.sections.map((s) => (
                  <a key={s.id} href={`#${s.id}`} className="block text-sm text-muted py-0.5">
                    {s.title}
                  </a>
                ))}
              </div>
            </details>

            <div className="space-y-12">
              {chapter.sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="font-display text-xl text-foreground mb-4 pb-2 border-b border-border/50">
                    {s.title}
                  </h2>
                  <div className="space-y-5">
                    {s.blocks.map((b, i) => (
                      <Block key={i} block={b} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Sources */}
            {strengthCited.length > 0 && (
              <section className="mt-14 pt-6 border-t border-border">
                <h2 className="font-display text-lg text-foreground mb-3">How we know this</h2>
                <ul className="space-y-2">
                  {strengthCited.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 text-sm">
                      {c.strength && (
                        <span className="text-[0.6rem] uppercase tracking-wide text-muted border border-border rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                          {c.strength}
                        </span>
                      )}
                      <span className="text-muted leading-relaxed">
                        <span className="text-foreground">{c.source}</span>
                        {c.claim ? ` — ${c.claim}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        </div>
      </main>
    </div>
  );
}
