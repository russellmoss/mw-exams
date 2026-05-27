"use client";

const papers = [
  {
    paper: 1,
    title: "Paper 1",
    subtitle: "White Wines",
    description: "Still white wines from around the world",
    color: "from-amber-900/40 to-yellow-900/20",
    borderColor: "border-amber-700/50",
    hoverBorder: "hover:border-amber-500/70",
    icon: "\u{1F7E1}",
  },
  {
    paper: 2,
    title: "Paper 2",
    subtitle: "Red Wines",
    description: "Still red wines from around the world",
    color: "from-red-900/40 to-rose-900/20",
    borderColor: "border-red-800/50",
    hoverBorder: "hover:border-red-500/70",
    icon: "\u{1F534}",
  },
  {
    paper: 3,
    title: "Paper 3",
    subtitle: "Special",
    description: "Sparkling, fortified, sweet, rose, oxidative",
    color: "from-purple-900/40 to-indigo-900/20",
    borderColor: "border-purple-700/50",
    hoverBorder: "hover:border-purple-500/70",
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
          className={`group relative overflow-hidden rounded-xl border ${p.borderColor} ${p.hoverBorder} bg-gradient-to-br ${p.color} p-8 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/30 cursor-pointer`}
        >
          <div className="text-3xl mb-4">{p.icon}</div>
          <h3 className="text-xl font-semibold text-foreground mb-1">
            {p.title}
          </h3>
          <p className="text-accent font-medium mb-2">{p.subtitle}</p>
          <p className="text-sm text-muted">{p.description}</p>
          <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/[0.02] rounded-tl-full" />
        </button>
      ))}
    </div>
  );
}
