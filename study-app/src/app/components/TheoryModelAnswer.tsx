"use client";

import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { TheoryStudyAnswer, TheoryStudyClaim } from "@/lib/theory/study";

export interface TheoryAnswerPayload extends TheoryStudyAnswer {
  annotatedBody: string;
  banner: string;
}

function sourceHref(reference: string): string | null {
  return reference.match(/https:\/\/[^\s;]+/)?.[0] ?? null;
}

function ClaimNote({ claim }: { claim: TheoryStudyClaim }) {
  const href = claim.source ? sourceHref(claim.source.ref) : null;
  const label =
    claim.status === "verified"
      ? "Verified"
      : claim.status === "time_sensitive"
        ? `Time-sensitive · ${claim.examYear} exam context`
        : "No tier-1 source in the verification pass";
  const tone =
    claim.status === "verified"
      ? "border-success/30 bg-success/5"
      : claim.status === "time_sensitive"
        ? "border-accent/30 bg-accent/5"
        : "border-border bg-background/30 opacity-75";

  return (
    <li id={`theory-claim-${claim.index}`} className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-start gap-2">
        <span className="font-mono text-[10px] text-muted mt-0.5">{claim.index}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted mt-1 leading-relaxed">{claim.claim}</p>
          {claim.source && (
            <p className="text-[11px] text-muted mt-2">
              Tier {claim.source.tier} · {claim.source.publisher}{" "}
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover underline">
                  source
                </a>
              ) : (
                <span title={claim.source.ref}>· {claim.source.ref}</span>
              )}
            </p>
          )}
          {claim.timeSensitive && (
            <p className="text-[11px] text-accent mt-1">
              Re-check this fact before using it as evidence about the current world.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function TheoryModelAnswer({ answer }: { answer: TheoryAnswerPayload }) {
  const claimsByAnchor = useMemo(
    () => new Map(answer.claims.map((claim) => [`#theory-claim-${claim.index}`, claim])),
    [answer.claims]
  );
  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        const claim = href ? claimsByAnchor.get(href) : null;
        if (!claim) {
          return <a href={href} className="text-accent hover:text-accent-hover underline">{children}</a>;
        }
        const className =
          claim.status === "verified"
            ? "decoration-success/70 underline decoration-dotted underline-offset-4"
            : claim.status === "time_sensitive"
              ? "decoration-accent underline decoration-dotted underline-offset-4"
              : "text-muted/75 decoration-muted/50 underline decoration-dotted underline-offset-4";
        return (
          <a href={href} className={className} title={`Claim ${claim.index}: ${claim.status.replace("_", " ")}`}>
            {children}<sup className="font-sans text-[9px] ml-0.5">{claim.index}</sup>
          </a>
        );
      },
    }),
    [claimsByAnchor]
  );

  return (
    <section className="space-y-4" aria-labelledby="theory-model-answer-title">
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Study exemplar</p>
            <h2 id="theory-model-answer-title" className="font-display text-xl font-semibold text-foreground mt-1">
              Model answer
            </h2>
          </div>
          <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] text-accent">
            Exam-year {answer.year}
          </span>
        </div>
        <p className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted leading-relaxed mb-5">
          {answer.banner}
        </p>
        <div className="markdown-content text-[15px] leading-relaxed">
          <ReactMarkdown components={components}>{answer.annotatedBody}</ReactMarkdown>
        </div>
      </div>

      <details className="bg-card rounded-xl border border-border" open>
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">
          Why this answer covers the examiner rubric
        </summary>
        <div className="border-t border-border px-5 py-4 space-y-3">
          {answer.coversCore.map((coverage) => (
            <div key={coverage.requirement} className="rounded-lg border border-border bg-background/30 p-3">
              <p className="text-sm font-medium text-foreground">{coverage.requirement}</p>
              <p className="text-xs text-accent mt-1">Covered in: {coverage.section}</p>
              <blockquote className="text-xs text-muted border-l-2 border-accent pl-3 mt-2 leading-relaxed">
                “{coverage.examinerQuote}”
              </blockquote>
            </div>
          ))}
        </div>
      </details>

      {answer.claims.length > 0 && (
        <details className="bg-card rounded-xl border border-border">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">
            Claim provenance ({answer.claims.length})
          </summary>
          <ol className="border-t border-border px-5 py-4 space-y-2">
            {answer.claims.map((claim) => <ClaimNote key={claim.claimId} claim={claim} />)}
          </ol>
        </details>
      )}
    </section>
  );
}
