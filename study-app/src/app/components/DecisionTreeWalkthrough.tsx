"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { MermaidDiagram } from "./MermaidDiagram";

interface DecisionTreeWalkthroughProps {
  paper: number;
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

const DIAGRAM_LABELS: Record<number, { key: string; label: string }> = {
  1: { key: "p1_whites", label: "Paper 1 — Whites Decision Tree" },
  2: { key: "p2_reds", label: "Paper 2 — Reds Decision Tree" },
  3: { key: "p3_special", label: "Paper 3 — Special Decision Tree" },
};

export function DecisionTreeWalkthrough({
  paper,
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
          const blocks = extractMermaidBlocks(data.studyDiagrams[info.key]);
          setDiagrams(blocks);
          if (blocks.length > 0) setExpandedDiagram(0);
        }
      } catch (err) {
        console.error("Failed to load diagrams:", err);
      }
    }

    loadDiagrams();
  }, [paper]);

  return (
    <div className="space-y-6">
      {/* Study diagram assist walkthrough */}
      {studyDiagramAssist && studyDiagramAssist.length > 50 && (
        <div className="bg-card rounded-xl border border-accent/30 p-6">
          <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-4">
            Decision Tree Walkthrough
          </h3>
          <div className="markdown-content text-[15px] leading-relaxed">
            <ReactMarkdown>{studyDiagramAssist}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Interactive diagrams */}
      {diagrams.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            {DIAGRAM_LABELS[paper]?.label || "Decision Trees"}
          </h3>

          {/* Diagram selector tabs */}
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
                {d.title || `Diagram ${i + 1}`}
              </button>
            ))}
          </div>

          {/* Selected diagram */}
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
