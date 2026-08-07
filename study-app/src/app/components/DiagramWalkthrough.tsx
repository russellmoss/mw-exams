"use client";

// The guided diagram walkthrough — runs once, between the first-run intro presentation and the
// spotlight UI tour (migration 051, users.walkthrough_seen). Replayable from the Library header.
//
// It teaches the study diagrams by working ONE real past question end to end:
//
//   2014 Paper 1, Question 2 — "Wines 5-8 come from four different countries and are made from
//   the same single grape variety."
//
// Everything shown here is quoted from the corpus, not invented:
//   • the stem text and mark split  → data/exams.json (2014, paper 1, q2)
//   • the routing diagram           → outputs/study_diagrams/p1_whites.md §1 "Stem Routing"
//   • the STRONG/PLAUSIBLE/CURVEBALL tiers → outputs/master_trees/p1_whites_tree.md, Branch 1,
//     sub-branch "3-4 wines", the leaf gated on the stem saying "different countries"
//   • the Layer B tasting fork      → same file, "For Riesling-led leaves"
//   • the four revealed wines       → data/exams.json (2014, paper 1, wines 5-8)
//
// If any of those sources change, this file must be re-checked against them — a walkthrough that
// teaches a tier the tree no longer holds is worse than no walkthrough.

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

interface Props {
  /** Fired when the user finishes or skips. `completed` is false only for an explicit Skip. */
  onDone: (completed: boolean) => void;
}

const TOTAL = 7;

const fadeUp = (delayMs: number, durationMs = 500): React.CSSProperties => ({
  animation: `introFadeUp ${durationMs}ms ${delayMs}ms both`,
});

const fade = (delayMs: number, durationMs = 500): React.CSSProperties => ({
  animation: `introFade ${durationMs}ms ${delayMs}ms both`,
});

/** Draw-in for an SVG connector: the line reveals along its own length. */
const drawIn = (length: number, delayMs: number): React.CSSProperties => ({
  strokeDasharray: length,
  strokeDashoffset: length,
  animation: `treeDraw 450ms ${delayMs}ms ease-out forwards`,
});

const STEP_EYEBROWS = [
  "The question",
  "Where they live",
  "Step 1 — route the stem",
  "Step 2 — read the tiers",
  "Step 3 — now taste",
  "The reveal",
  "What the tree is for",
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function Tier({
  label,
  tone,
  items,
  delayMs,
}: {
  label: string;
  tone: "strong" | "plausible" | "curveball";
  items: string[];
  delayMs: number;
}) {
  const color =
    tone === "strong" ? "text-success" : tone === "plausible" ? "text-accent" : "text-fail";
  const ring =
    tone === "strong"
      ? "border-success/40 bg-success/5"
      : tone === "plausible"
        ? "border-accent/40 bg-accent/5"
        : "border-fail/40 bg-fail/5";
  return (
    <div className={`rounded-lg border ${ring} p-4 text-left`} style={fadeUp(delayMs)}>
      <p className={`text-[0.6875rem] font-semibold uppercase tracking-[0.1em] ${color} mb-2`}>
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="text-[0.9375rem] text-foreground leading-snug">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A node in the mini decision diagrams. `state` drives the accent/dim treatment. */
function Node({
  x,
  y,
  w,
  h,
  lines,
  state = "normal",
  delayMs,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: { text: string; small?: boolean }[];
  state?: "normal" | "active" | "dim";
  delayMs: number;
}) {
  const fill =
    state === "active" ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--card)";
  const stroke = state === "active" ? "var(--accent)" : "var(--border)";
  // Vertically centre the label block inside the node.
  const lineHeight = 15;
  const startY = y + h / 2 - ((lines.length - 1) * lineHeight) / 2 + 4;
  return (
    <g style={{ ...fade(delayMs), opacity: state === "dim" ? 0.35 : 1 }}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1} />
      {lines.map((line, index) => (
        <text
          key={line.text}
          x={x + w / 2}
          y={startY + index * lineHeight}
          textAnchor="middle"
          fill={
            line.small
              ? "var(--muted)"
              : state === "active"
                ? "var(--accent)"
                : "var(--foreground)"
          }
          fontSize={line.small ? 10.5 : 12.5}
          fontWeight={state === "active" && !line.small ? 600 : 400}
        >
          {line.text}
        </text>
      ))}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — the stem-routing diagram (p1_whites.md §1)
// ─────────────────────────────────────────────────────────────────────────────

function RoutingDiagram() {
  return (
    <svg viewBox="0 0 720 244" className="w-full h-auto" role="img" aria-label="Stem routing: a P1 stem that fixes the grape variety routes to family F1, Same Variety">
      <Node x={260} y={12} w={200} h={38} lines={[{ text: "Read the Paper 1 stem" }]} delayMs={0} />
      <path d="M360,50 V84" stroke="var(--border)" strokeWidth={1.5} fill="none" style={drawIn(34, 200)} />

      <Node
        x={205}
        y={84}
        w={310}
        h={44}
        lines={[{ text: "Does the stem fix the grape variety?" }]}
        delayMs={350}
      />

      {/* YES → F1 (the route this question takes) */}
      <path
        d="M360,128 V152 H200 V180"
        stroke="var(--accent)"
        strokeWidth={2}
        fill="none"
        style={drawIn(220, 700)}
      />
      <text x={286} y={147} textAnchor="middle" fill="var(--accent)" fontSize={10.5} fontWeight={600} style={fade(900)}>
        YES
      </text>

      {/* NO → everything else */}
      <path
        d="M360,128 V152 H540 V180"
        stroke="var(--border)"
        strokeWidth={1.5}
        fill="none"
        style={drawIn(240, 700)}
      />
      <text x={452} y={147} textAnchor="middle" fill="var(--muted)" fontSize={10.5} style={fade(900)}>
        NO
      </text>

      <Node
        x={100}
        y={180}
        w={200}
        h={48}
        state="active"
        lines={[{ text: "F1 · Same Variety" }, { text: "13 of 40 P1 questions", small: true }]}
        delayMs={1150}
      />
      <Node
        x={440}
        y={180}
        w={200}
        h={48}
        state="dim"
        lines={[{ text: "F2 · F3 · F4 · F5 · F7" }, { text: "origin · blend · breadth · method", small: true }]}
        delayMs={1150}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — the Layer B tasting fork for Riesling-led leaves
// ─────────────────────────────────────────────────────────────────────────────

function TastingDiagram() {
  const cues: { x: number; lines: { text: string; small?: boolean }[]; region: string }[] = [
    {
      x: 20,
      lines: [{ text: "Low alcohol + RS" }, { text: "slate / petrol" }],
      region: "Mosel Kabinett",
    },
    {
      x: 260,
      lines: [{ text: "Bone dry + firm extract" }, { text: "mineral power" }],
      region: "GG / Rheingau / Alsace",
    },
    {
      x: 500,
      lines: [{ text: "Bone dry + lime cordial" }, { text: "youth, less extract" }],
      region: "Clare / Eden Valley",
    },
  ];
  return (
    <svg viewBox="0 0 720 262" className="w-full h-auto" role="img" aria-label="In-glass fork: lime, searing acid and no oak resolve to Riesling, which then splits three ways by alcohol and residual sugar">
      <Node
        x={200}
        y={10}
        w={320}
        h={40}
        lines={[{ text: "Lime / citrus · searing acid · no oak" }]}
        delayMs={0}
      />
      <path d="M360,50 V76" stroke="var(--border)" strokeWidth={1.5} fill="none" style={drawIn(26, 200)} />
      <Node x={285} y={76} w={150} h={36} state="active" lines={[{ text: "RIESLING" }]} delayMs={350} />

      <path
        d="M360,112 V134 H120 V156"
        stroke="var(--border)"
        strokeWidth={1.5}
        fill="none"
        style={drawIn(300, 650)}
      />
      <path d="M360,112 V156" stroke="var(--border)" strokeWidth={1.5} fill="none" style={drawIn(44, 650)} />
      <path
        d="M360,112 V134 H600 V156"
        stroke="var(--border)"
        strokeWidth={1.5}
        fill="none"
        style={drawIn(300, 650)}
      />

      {cues.map((cue, index) => (
        <g key={cue.region}>
          <Node x={cue.x} y={156} w={200} h={44} lines={cue.lines} delayMs={1000 + index * 120} />
          <path
            d={`M${cue.x + 100},200 V222`}
            stroke="var(--border)"
            strokeWidth={1.5}
            fill="none"
            style={drawIn(22, 1300 + index * 120)}
          />
          <text
            x={cue.x + 100}
            y={240}
            textAnchor="middle"
            fill="var(--accent)"
            fontSize={12.5}
            fontWeight={600}
            style={fade(1450 + index * 120)}
          >
            {cue.region}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — the reveal
// ─────────────────────────────────────────────────────────────────────────────

const REVEAL: {
  wine: string;
  origin: string;
  verdict: "STRONG" | "CURVEBALL";
  note: string;
}[] = [
  {
    wine: "Watervale Riesling, Mount Horrocks 2013",
    origin: "Clare Valley, Australia · 12.5%",
    verdict: "STRONG",
    note: "Named in the tree’s Riesling region list.",
  },
  {
    wine: "Riesling Grand Cru Muenchberg, Domaine Ostertag 2011",
    origin: "Alsace, France · 13.5%",
    verdict: "STRONG",
    note: "Named in the tree’s Riesling region list.",
  },
  {
    wine: "Deidesheimer Kieselberg Kabinett Trocken, von Bassermann-Jordan 2011",
    origin: "Pfalz, Germany · 11.5%",
    verdict: "STRONG",
    note: "German dry Riesling — the tree names Mosel and Rheingau/Franken; Pfalz is the same neighbourhood.",
  },
  {
    wine: "Riesling, Domaine Rewa 2011",
    origin: "Central Otago, New Zealand · 11.5%",
    verdict: "CURVEBALL",
    note: "New Zealand Riesling. Now PLAUSIBLE in the tree — it was added by the 2026 routing sweep after this very question exposed the gap.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export function DiagramWalkthrough({ onDone }: Props) {
  const [step, setStep] = useState(0);

  const next = useCallback(() => {
    setStep((current) => {
      if (current >= TOTAL - 1) {
        onDone(true);
        return current;
      }
      return current + 1;
    });
  }, [onDone]);

  // Arrow keys page through, matching the click-through affordance.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") setStep((current) => Math.max(0, current - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next]);

  return (
    <div className="fixed inset-0 z-[58] bg-background flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="BWC" width={28} height={28} className="opacity-80" />
          <span className="text-[0.8125rem] text-muted">How the study diagrams work</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[0.6875rem] text-muted tabular-nums">
            {step + 1} / {TOTAL}
          </span>
          <button
            onClick={() => onDone(false)}
            className="text-xs font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>
      </div>

      {/* key={step} remounts the content so the entrance animations re-run per step. `my-auto` on
          the inner block centres short steps in the leftover space without clipping tall ones —
          steps vary from a single stat pair to four wine cards, and top-aligning them all left a
          dead gap above the footer on the short ones. */}
      <div key={step} className="flex-1 overflow-y-auto px-6 flex">
        <div className="w-full max-w-[52rem] mx-auto my-auto py-4">
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4 text-center"
            style={fade(0, 500)}
          >
            {STEP_EYEBROWS[step]}
          </p>

          {step === 0 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Start with a real question.
              </h1>
              <p className="text-[0.9375rem] text-muted mb-6" style={fadeUp(300, 500)}>
                Not a mock. This was sat by real candidates.
              </p>
              <div className="rounded-xl border border-border bg-card p-6 text-left" style={fadeUp(500, 600)}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent mb-3">
                  2014 · Paper 1 · Question 2
                </p>
                <p className="text-base text-foreground leading-relaxed mb-4">
                  Wines 5-8 come from four different countries and are made from the same single
                  grape variety.
                </p>
                <div className="space-y-1.5 text-[0.875rem] text-muted border-t border-border pt-3">
                  <p>
                    <span className="text-foreground">a)</span> Identify the grape variety.{" "}
                    <span className="font-mono text-accent tabular-nums">24 marks</span>
                  </p>
                  <p>
                    <span className="text-foreground">b)</span> Identify the origin as closely as
                    possible. <span className="font-mono text-accent tabular-nums">4 × 10 marks</span>
                  </p>
                  <p>
                    <span className="text-foreground">c)</span> Discuss quality and style.{" "}
                    <span className="font-mono text-accent tabular-nums">4 × 9 marks</span>
                  </p>
                </div>
              </div>
              <p className="text-[0.9375rem] text-muted leading-relaxed mt-6" style={fadeUp(900, 500)}>
                Four wines. Around twelve minutes each. You haven’t smelled anything yet — and the
                stem has already narrowed the world of wine to a handful of candidates.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                The diagrams live in the Library.
              </h1>
              <p className="text-[0.9375rem] text-muted mb-7" style={fadeUp(300, 500)}>
                One deck per paper, plus a card for every major variety.
              </p>

              {/* A still of the real nav, with Library called out. */}
              <div className="rounded-xl border border-border bg-card p-2 mb-7 inline-flex items-center gap-1" style={fadeUp(500, 500)}>
                {["Theory", "Practical", "Library", "History"].map((item) => (
                  <span
                    key={item}
                    className={`rounded-lg px-4 py-2 text-sm ${
                      item === "Library"
                        ? "bg-accent/15 text-accent font-semibold ring-1 ring-accent/40"
                        : "text-muted"
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { name: "P1 Whites", detail: "still white wines" },
                  { name: "P2 Reds", detail: "still red wines" },
                  { name: "P3 Special", detail: "sparkling · fortified · sweet" },
                  { name: "Variety Cards", detail: "one card per grape" },
                ].map((deck, index) => (
                  <div
                    key={deck.name}
                    className={`rounded-lg border p-4 text-left ${
                      deck.name === "P1 Whites"
                        ? "border-accent/40 bg-accent/5"
                        : "border-border bg-card"
                    }`}
                    style={fadeUp(700 + index * 100)}
                  >
                    <p
                      className={`text-sm font-semibold ${
                        deck.name === "P1 Whites" ? "text-accent" : "text-foreground"
                      }`}
                    >
                      {deck.name}
                    </p>
                    <p className="text-xs text-muted mt-1 leading-snug">{deck.detail}</p>
                  </div>
                ))}
              </div>

              <p className="text-[0.9375rem] text-muted leading-relaxed mt-7" style={fadeUp(1200, 500)}>
                Our question is a white wine paper, so we open{" "}
                <span className="text-foreground">P1 Whites</span>. Every deck opens with the same
                first diagram — <span className="text-foreground">Stem Routing</span>.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Route the stem to a family.
              </h1>
              <p className="text-[0.9375rem] text-muted mb-6 max-w-[38rem] mx-auto leading-relaxed" style={fadeUp(300, 500)}>
                The routing diagram asks one question at a time. Our stem says{" "}
                <span className="text-accent">“the same single grape variety”</span> — so the very
                first fork resolves, and five of the six families fall away.
              </p>
              <div className="rounded-xl border border-border bg-card p-5" style={fadeUp(450, 500)}>
                <RoutingDiagram />
              </div>
              <p className="text-[0.9375rem] text-muted leading-relaxed mt-6" style={fadeUp(1500, 500)}>
                You are now in <span className="text-foreground">F1 · Same Variety</span> — the most
                common structure in Paper 1. That family has its own tree, and that tree has a leaf
                for exactly this stem.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Read the leaf. Three tiers.
              </h1>
              <p className="text-[0.9375rem] text-muted mb-7 max-w-[40rem] mx-auto leading-relaxed" style={fadeUp(300, 500)}>
                The stem adds one more constraint —{" "}
                <span className="text-accent">“four different countries”</span> — which selects a
                specific leaf. That leaf is your candidate set, and every candidate carries a
                confidence tier.
              </p>

              <div className="grid gap-3 sm:grid-cols-3 mb-7">
                <Tier
                  label="Strong signal"
                  tone="strong"
                  items={["Chardonnay", "Riesling", "Sauvignon Blanc"]}
                  delayMs={500}
                />
                <Tier label="Plausible" tone="plausible" items={["Chenin Blanc", "Semillon"]} delayMs={700} />
                <Tier label="Curveball" tone="curveball" items={["Pinot Gris"]} delayMs={900} />
              </div>

              <div className="rounded-lg border border-border bg-card p-5 text-left space-y-2.5" style={fadeUp(1150, 500)}>
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  <span className="text-success font-medium">STRONG SIGNAL</span> — the examiners
                  have reached for this repeatedly in this exact construction. Lead with it.
                </p>
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  <span className="text-accent font-medium">PLAUSIBLE</span> — attested, but less
                  often. Keep it live; don’t open with it.
                </p>
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  <span className="text-fail font-medium">CURVEBALL</span> — rare, and usually the
                  one wine in the flight designed to be hard. Taste carefully before committing.
                </p>
              </div>

              <div
                className="rounded-lg border border-accent/40 bg-accent/5 p-5 text-left mt-3"
                style={fadeUp(1300, 500)}
              >
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent mb-2">
                  Then apply judgment
                </p>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  The tree will show Chenin Blanc and Semillon as{" "}
                  <span className="text-accent">PLAUSIBLE</span> — but logic dictates that this is a
                  question about four wines of the same variety, each from a different country. Are
                  you likely to have Semillon from four different countries? No. So you can rule
                  that out, and be pretty certain it will be one of the strong-signal varieties.
                </p>
                <p className="text-[0.9375rem] text-foreground leading-relaxed mt-3">
                  The trees and leaves are not a substitute for human judgment — they are a way to
                  narrow the field.
                </p>
              </div>

              <p className="text-[0.9375rem] text-muted leading-relaxed mt-6" style={fadeUp(1550, 500)}>
                Three tiers, not percentages. Fifteen years of papers is too small a corpus to
                pretend otherwise.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Now you taste.
              </h1>
              <p className="text-[0.9375rem] text-muted mb-6 max-w-[40rem] mx-auto leading-relaxed" style={fadeUp(300, 500)}>
                Everything so far happened before the glass. The second half of each tree is the
                sensory overlay — it takes what’s actually in front of you and cuts the candidate
                set down.
              </p>
              <div className="rounded-xl border border-border bg-card p-5" style={fadeUp(450, 500)}>
                <TastingDiagram />
              </div>
              <p className="text-[0.9375rem] text-muted leading-relaxed mt-6" style={fadeUp(1700, 500)}>
                Lime, searing acid, no oak — that’s Riesling, and Riesling was already{" "}
                <span className="text-success">STRONG</span>. The alcohol and sugar then split the
                world three ways.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                What was actually in the glasses.
              </h1>
              <p className="text-[0.9375rem] text-muted mb-6" style={fadeUp(300, 500)}>
                2014, Paper 1, wines 5–8.
              </p>
              <div className="space-y-2.5 text-left">
                {REVEAL.map((row, index) => (
                  <div
                    key={row.wine}
                    className="rounded-lg border border-border bg-card p-4 flex items-start gap-4"
                    style={fadeUp(500 + index * 180)}
                  >
                    <span
                      className={`shrink-0 mt-0.5 rounded px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] ${
                        row.verdict === "STRONG"
                          ? "bg-success/15 text-success"
                          : "bg-fail/15 text-fail"
                      }`}
                    >
                      {row.verdict}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] text-foreground leading-snug">{row.wine}</p>
                      <p className="text-[0.8125rem] text-muted mt-0.5">{row.origin}</p>
                      <p className="text-xs text-muted mt-1.5 leading-relaxed italic">{row.note}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[0.9375rem] text-muted leading-relaxed mt-6" style={fadeUp(1400, 500)}>
                The variety was a <span className="text-success">STRONG</span> call and three of the
                four origins sat in the tree’s named list. The fourth is the{" "}
                <span className="text-fail">curveball</span> — and in a multi-wine question there is
                usually exactly one.
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-4" style={fadeUp(0, 600)}>
                The tree bounds the universe.<br />You narrow from there.
              </h1>
              <p className="text-[0.9375rem] text-muted leading-relaxed max-w-[40rem] mx-auto mb-8" style={fadeUp(300, 500)}>
                It will not name the wine for you, and it never pretends to. Top-1 accuracy is about
                one in three. What it does is walk you into the room with a short, ranked list
                instead of the whole world — which is the difference between eight minutes of
                deduction and eight minutes of panic.
              </p>
              <div className="flex flex-wrap gap-10 justify-center mb-9">
                <div style={fadeUp(600)}>
                  <p className="font-display text-[3rem] font-bold tabular-nums leading-none text-accent">
                    89%
                  </p>
                  <p className="text-xs text-muted mt-2 max-w-[12rem]">
                    true variety inside the candidate set — 2026 paper, predicted blind
                  </p>
                </div>
                <div style={fadeUp(800)}>
                  <p className="font-display text-[3rem] font-bold tabular-nums leading-none text-foreground">
                    13
                  </p>
                  <p className="text-xs text-muted mt-2 max-w-[12rem]">
                    of 40 Paper 1 questions use the structure you just walked
                  </p>
                </div>
              </div>
              <button
                onClick={() => onDone(true)}
                className="rounded-lg bg-accent hover:bg-accent-hover px-8 py-3 text-base font-semibold text-background transition-colors cursor-pointer"
                style={fadeUp(1000)}
              >
                Show me around the app &rarr;
              </button>
              <p className="text-xs text-muted mt-5" style={fadeUp(1200)}>
                You can replay this any time from the Library.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 px-6 py-5 shrink-0">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((current) => current - 1)}
              className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
            >
              &larr; Back
            </button>
          )}
          {step < TOTAL - 1 && (
            <button
              onClick={next}
              className="rounded-lg bg-accent hover:bg-accent-hover px-7 py-2 text-sm font-semibold text-background transition-colors cursor-pointer"
            >
              Next &rarr;
            </button>
          )}
        </div>
        <div className="flex items-center justify-center gap-2.5">
          {Array.from({ length: TOTAL }, (_, index) => (
            <span
              key={index}
              className={`rounded-full transition-all ${
                index === step ? "w-6 h-2 bg-accent" : "w-2 h-2 bg-border"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
