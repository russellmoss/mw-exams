"use client";

// Each paper is identified by its icon and subtitle, not by a card colour — the same way papers are
// labelled everywhere else in the app (history badges, filter chips). The cards themselves are plain
// Cellar cards so they theme from the tokens. See DESIGN.md (Color, Layout).
const papers = [
  {
    paper: 1,
    title: "Paper 1",
    subtitle: "White Wines",
    description: "Still white wines from around the world",
    icon: "\u{1F7E1}",
  },
  {
    paper: 2,
    title: "Paper 2",
    subtitle: "Red Wines",
    description: "Still red wines from around the world",
    icon: "\u{1F534}",
  },
  {
    paper: 3,
    title: "Paper 3",
    subtitle: "Special",
    description: "Sparkling, fortified, sweet, rose, oxidative",
    icon: "\u{1F7E3}",
  },
];

interface PaperSelectorProps {
  onSelect: (paper: number) => void;
}

export function PaperSelector({ onSelect }: PaperSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {papers.map((p) => (
        <button
          key={p.paper}
          onClick={() => onSelect(p.paper)}
          className="rounded-xl border border-border bg-card hover:border-muted hover:bg-card-hover p-8 text-left transition-colors duration-200 cursor-pointer"
        >
          <div className="text-3xl mb-4">{p.icon}</div>
          <h3 className="text-xl font-semibold text-foreground mb-1">
            {p.title}
          </h3>
          <p className="text-accent font-medium mb-2">{p.subtitle}</p>
          <p className="text-sm text-muted">{p.description}</p>
        </button>
      ))}
    </div>
  );
}
