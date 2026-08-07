import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoachChatSim, type Beat } from "@/app/components/coach/CoachChatSim";

// A mount smoke test for the conversation panel.
//
// This repo has no jsdom or testing-library, so effects do not run here and the animation is not
// exercised — what this proves is narrower but still worth having: the component renders at all, and
// its resting state is the empty panel rather than a flash of the finished transcript. A component
// that threw on mount would otherwise only be discovered by a human opening the walkthrough.

const SCRIPT: Beat[] = [
  { kind: "ask", text: "Does Semillon ever cross countries?" },
  { kind: "status", label: "Searching the past papers…" },
  { kind: "say", text: "Yes — 2023 Paper 1.", checked: ["query_corpus"] },
  {
    kind: "card",
    preview: "Report question gq_x",
    details: [{ label: "Question", value: "gq_x" }],
    confirmAfterMs: 100,
    result: "Filed.",
    verdict: { tone: "accept", label: "Accepted — you were right", reason: "Because." },
  },
];

describe("CoachChatSim mounts", () => {
  const html = renderToStaticMarkup(<CoachChatSim script={SCRIPT} runKey="test" />);

  it("renders the panel chrome", () => {
    expect(html).toContain("Coach");
    expect(html).toContain("Ask the Coach…");
    expect(html).toContain("Send");
  });

  it("offers the playback controls", () => {
    expect(html).toContain("Pause");
    expect(html).toContain("Skip to end");
  });

  it("starts empty rather than flashing the scripted transcript", () => {
    // The whole point is a conversation that arrives over time. If the first paint already held the
    // answer, the reveal would be decorative.
    expect(html).not.toContain("2023 Paper 1");
    expect(html).not.toContain("Accepted — you were right");
    expect(html).not.toContain("Does Semillon ever cross countries?");
  });

  it("applies the caller's height so the slide controls the panel size", () => {
    const tall = renderToStaticMarkup(
      <CoachChatSim script={SCRIPT} runKey="test" heightClass="h-[31rem]" />
    );
    expect(tall).toContain("h-[31rem]");
  });
});
