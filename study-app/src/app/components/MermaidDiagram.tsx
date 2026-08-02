"use client";

import { useEffect, useRef, useState } from "react";
import { DiagramModal } from "./DiagramModal";
import { useTheme } from "@/lib/theme-context";

interface MermaidDiagramProps {
  chart: string;
  title?: string;
}

export function MermaidDiagram({ chart, title }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    // Pull the live palette off <html> rather than hardcoding hexes, so the diagram follows whichever
    // theme is active. `theme` is in the dep array purely to force a re-render on toggle.
    const token = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        const background = token("--background", "#0c0a09");
        const card = token("--card", "#1c1917");
        const cardHover = token("--card-hover", "#292524");
        const border = token("--border", "#44403c");
        const muted = token("--muted", "#78716c");
        const foreground = token("--foreground", "#e7e5e4");

        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "light" ? "default" : "dark",
          themeVariables: {
            primaryColor: theme === "light" ? cardHover : border,
            primaryTextColor: foreground,
            primaryBorderColor: muted,
            lineColor: muted,
            secondaryColor: card,
            tertiaryColor: cardHover,
            background,
            mainBkg: card,
            nodeBorder: muted,
            clusterBkg: card,
            titleColor: foreground,
            edgeLabelBackground: card,
          },
          flowchart: {
            htmlLabels: true,
            curve: "basis",
          },
        });

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [chart, theme]);

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        {title && (
          <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            {title}
          </h4>
        )}
        <pre className="text-xs text-muted overflow-x-auto whitespace-pre-wrap font-mono">
          {chart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
        <div className="h-40 bg-border/30 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 overflow-x-auto relative group">
      <div className="flex items-center mb-4">
        {title && (
          <h4 className="text-sm font-semibold text-muted uppercase tracking-wider">
            {title}
          </h4>
        )}
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground rounded-lg border border-border hover:border-muted px-2.5 py-1"
          aria-label="Expand diagram to fullscreen"
        >
          <span aria-hidden>⛶</span> Expand
        </button>
      </div>
      <div
        ref={containerRef}
        onClick={() => setZoomed(true)}
        title="Click to expand"
        className="flex justify-center [&_svg]:max-w-full cursor-zoom-in"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {zoomed && (
        <DiagramModal svg={svg} title={title} onClose={() => setZoomed(false)} />
      )}
    </div>
  );
}
