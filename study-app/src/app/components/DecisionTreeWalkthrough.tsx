"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { MermaidDiagram } from "./MermaidDiagram";

interface DecisionTreeWalkthroughProps {
  paper: number;
  family?: string;
  studyDiagramAssist?: string;
}

function extractMermaidBlocks(
  markdown: string
): { title: string; chart: string }[] {
  const blocks: { title: string; chart: string }[] = [];
  const regex = /(?:^|\n)(?:#{1,3}\s+(.+?)\n)?```mermaid\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({
      title: match[1]?.trim() || "",
      chart: match[2].trim(),
    });
  }

  return blocks;
}

// Map question families to which diagram sections are relevant
const FAMILY_DIAGRAM_KEYWORDS: Record<string, string[]> = {
  F1: ["stem routing", "same variety", "f1"],
  F2: ["stem routing", "same origin", "f2"],
  F3: ["stem routing", "blend", "f3"],
  F4: ["stem routing", "breadth", "f4"],
  F5: ["stem routing", "method", "f5"],
  F6: ["stem routing", "style", "f6"],
  F7: ["stem routing", "hierarchy", "f7"],
};

function filterRelevantDiagrams(
  diagrams: { title: string; chart: string }[],
  family?: string
): { title: string; chart: string }[] {
  if (!family) return diagrams;

  const keywords = FAMILY_DIAGRAM_KEYWORDS[family];
  if (!keywords) return diagrams;

  const relevant = diagrams.filter((d) => {
    const titleLower = d.title.toLowerCase();
    return keywords.some((kw) => titleLower.includes(kw));
  });

  // Always include at least the stem routing diagram
  if (relevant.length === 0) {
    const stemRouting = diagrams.find((d) =>
      d.title.toLowerCase().includes("stem routing")
    );
    if (stemRouting) return [stemRouting];
  }

  return relevant;
}

const DIAGRAM_LABELS: Record<number, { key: string; label: string }> = {
  1: { key: "p1_whites", label: "Paper 1 — Whites" },
  2: { key: "p2_reds", label: "Paper 2 — Reds" },
  3: { key: "p3_special", label: "Paper 3 — Special" },
};

export function DecisionTreeWalkthrough({
  paper,
  family,
  studyDiagramAssist,
}: DecisionTreeWalkthroughProps) {
  const [diagrams, setDiagrams] = useState<{ title: string; chart: string }[]>(
    []
  );
  const [expandedDiagram, setExpandedDiagram] = useState<number | null>(null);

  useEffect(() => {
    async function loadDiagrams() {
      try {
        const res = await fetch("/data/question-index.json");
        const data = await res.json();
        const info = DIAGRAM_LABELS[paper];
        if (info && data.studyDiagrams?.[info.key]) {
          const allBlocks = extractMermaidBlocks(data.studyDiagrams[info.key]);
          const relevant = filterRelevantDiagrams(allBlocks, family);
          setDiagrams(relevant);
          if (relevant.length > 0) setExpandedDiagram(0);
        }
      } catch (err) {
        console.error("Failed to load diagrams:", err);
      }
    }

    loadDiagrams();
  }, [paper, family]);

  if (!studyDiagramAssist && diagrams.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Study diagram assist walkthrough */}
      {studyDiagramAssist && studyDiagramAssist.length > 50 && (
        <div className="bg-card rounded-xl border border-accent/30 p-6">
          <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-4">
            Decision Tree Walkthrough for This Question
          </h3>
          <div className="markdown-content text-[15px] leading-relaxed">
            <ReactMarkdown>{studyDiagramAssist}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Relevant diagrams only */}
      {diagrams.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Relevant Decision Trees — {DIAGRAM_LABELS[paper]?.label}
          </h3>
          <p className="text-xs text-muted mb-4">
            These are the specific tree sections that apply to this question type.
          </p>

          {/* Diagram tabs */}
          {diagrams.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {diagrams.map((d, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setExpandedDiagram(expandedDiagram === i ? null : i)
                  }
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                    expandedDiagram === i
                      ? "bg-accent/20 border-accent/40 text-accent"
                      : "bg-card border-border text-muted hover:text-foreground hover:border-accent/30"
                  }`}
                >
                  {d.title || `Tree ${i + 1}`}
                </button>
              ))}
            </div>
          )}

          {/* Render selected diagram (or the only one if just 1) */}
          {expandedDiagram !== null && diagrams[expandedDiagram] && (
            <MermaidDiagram
              chart={diagrams[expandedDiagram].chart}
              title={diagrams[expandedDiagram].title}
            />
          )}
        </div>
      )}
    </div>
  );
}
