"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

// ── Types mirroring /api/admin/costs ──────────────────────────────────────────
interface Summary {
  claudeCost: number;
  tavilyCost: number;
  elevenLabsCost: number;
  totalCost: number;
  claudeCalls: number;
  tavilyCalls: number;
  elevenLabsCalls: number;
  elevenLabsChars: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  errors: number;
  tavilyCredits: number;
}
interface ByModel { model: string; calls: number; cost_usd: number; input_tokens: number; output_tokens: number; avg_latency_ms: number; }
interface ByTask { task_type: string; calls: number; cost_usd: number; input_tokens: number; output_tokens: number; avg_latency_ms: number; }
interface BySource { source: string; calls: number; cost_usd: number; }
interface ByModelTask { task_type: string; model: string; calls: number; cost_usd: number; avg_cost_usd: number; avg_input_tokens: number; avg_output_tokens: number; avg_latency_ms: number; errors: number; }
interface TavilyByTask { task_type: string; calls: number; credits: number; cost_usd: number; }
interface ElevenLabsByTask { task_type: string; calls: number; characters: number; cost_usd: number; }
interface RecentRow {
  id: number; created_at: string; task_type: string; model: string; source: string;
  user_id: number | null; question_id: string | null; ab_group: string | null;
  input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number;
  cost_usd: number; latency_ms: number | null; success: boolean;
}
interface CostData {
  summary: Summary;
  byModel: ByModel[];
  byTask: ByTask[];
  bySource: BySource[];
  byModelTask: ByModelTask[];
  byDay: { day: string; cost_usd: number; calls: number }[];
  tavily: { byTask: TavilyByTask[]; byDay: { day: string; cost_usd: number; calls: number }[] };
  elevenLabs: { byTask: ElevenLabsByTask[]; byDay: { day: string; cost_usd: number; calls: number }[] };
  recent: RecentRow[];
  filterOptions: { models: string[]; tasks: string[] };
}

// ── Formatting helpers ────────────────────────────────────────────────────────
const usd = (n: number) => {
  const v = Number(n) || 0;
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(5)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const num = (n: number) => (Number(n) || 0).toLocaleString();
const ms = (n: number | null) => (n == null ? "—" : `${num(Math.round(n))} ms`);

const RANGES: { label: string; days: number | null }[] = [
  { label: "All time", days: null },
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

const TIERS = ["opus", "sonnet", "haiku"] as const;
type Tier = (typeof TIERS)[number];
interface AbTask { task: string; label: string; defaultTier: Tier; }

type SortKey = keyof RecentRow;

export default function CostsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [rangeIdx, setRangeIdx] = useState(0);
  const [model, setModel] = useState("");
  const [task, setTask] = useState("");
  const [source, setSource] = useState("");

  // Recent-table sort
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Top-level tab: usage scorecards (default) vs. the A/B model-mix editor
  const [tab, setTab] = useState<"usage" | "mix">("usage");

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) router.push("/");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      const range = RANGES[rangeIdx];
      if (range.days != null) {
        const from = new Date(Date.now() - range.days * 24 * 60 * 60 * 1000);
        params.set("from", from.toISOString());
      }
      if (model) params.set("model", model);
      if (task) params.set("task", task);
      if (source) params.set("source", source);
      try {
        const r = await fetch(`/api/admin/costs?${params.toString()}`);
        if (!r.ok) throw new Error("Failed to load costs");
        const d = await r.json();
        if (!cancelled) { setData(d); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, rangeIdx, model, task, source]);

  const sortedRecent = useMemo(() => {
    if (!data) return [];
    const rows = [...data.recent];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Group the per-(task,model) rows by task so each task shows its model options side by side.
  const comparisonByTask = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, ByModelTask[]>();
    for (const row of data.byModelTask) {
      const arr = map.get(row.task_type) || [];
      arr.push(row);
      map.set(row.task_type, arr);
    }
    return [...map.entries()].map(([taskType, rows]) => ({ taskType, rows }));
  }, [data]);

  if (authLoading || (loading && !data)) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-muted">
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
          <span className="ml-2 text-sm">Loading cost data...</span>
        </div>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Cost &amp; usage</h1>
            <p className="text-sm text-muted mt-1">Claude &amp; Tavily spend by model, task, and source</p>
          </div>
          <Link href="/admin" className="shrink-0 text-sm px-4 py-2 border border-border hover:border-accent text-muted hover:text-foreground rounded-lg transition-colors">
            ← Back to admin
          </Link>
        </div>
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            <TabButton active={tab === "usage"} onClick={() => setTab("usage")}>Usage</TabButton>
            <TabButton active={tab === "mix"} onClick={() => setTab("mix")}>Model mix</TabButton>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-3">
              <p className="text-sm text-fail">{error}</p>
            </div>
          )}

          {tab === "mix" && <AbPanel />}

          {tab === "usage" && (
          <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {RANGES.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => setRangeIdx(i)}
                  className={`px-3 py-1.5 text-sm transition-colors cursor-pointer ${rangeIdx === i ? "bg-accent text-background font-medium" : "text-muted hover:text-foreground"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <select value={task} onChange={(e) => setTask(e.target.value)}
              className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent cursor-pointer">
              <option value="">All tasks</option>
              {data?.filterOptions.tasks.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={model} onChange={(e) => setModel(e.target.value)}
              className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent cursor-pointer">
              <option value="">All models</option>
              {data?.filterOptions.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)}
              className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent cursor-pointer">
              <option value="">All sources</option>
              <option value="server">Server key (we pay)</option>
              <option value="user">User key</option>
            </select>
            {(model || task || source) && (
              <button onClick={() => { setModel(""); setTask(""); setSource(""); }}
                className="text-sm text-muted hover:text-foreground underline cursor-pointer">Clear</button>
            )}
            {loading && <span className="text-xs text-muted">updating…</span>}
          </div>

          {/* Summary cards */}
          {s && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <SummaryCard label="Total spend" value={usd(s.totalCost)} sub={`${num(s.claudeCalls + s.tavilyCalls + s.elevenLabsCalls)} calls`} accent />
              <SummaryCard label="Claude" value={usd(s.claudeCost)} sub={`${num(s.claudeCalls)} calls · ${s.errors} errors`} />
              <SummaryCard label="Tavily" value={usd(s.tavilyCost)} sub={`${num(s.tavilyCalls)} searches · ${num(s.tavilyCredits)} credits`} />
              <SummaryCard label="ElevenLabs (TTS)" value={usd(s.elevenLabsCost)} sub={`${num(s.elevenLabsCalls)} clips · ${num(s.elevenLabsChars)} chars`} />
              <SummaryCard label="Tokens (in / out)" value={`${num(s.inputTokens)} / ${num(s.outputTokens)}`} sub={`cache read ${num(s.cacheReadTokens)}`} />
            </div>
          )}

          {/* By model + By source */}
          <div className="grid md:grid-cols-2 gap-6">
            <Panel title="By model">
              <SimpleTable
                head={["Model", "Calls", "In", "Out", "Avg latency", "Cost"]}
                rows={(data?.byModel || []).map((m) => [m.model, num(m.calls), num(m.input_tokens), num(m.output_tokens), ms(m.avg_latency_ms), usd(m.cost_usd)])}
                right={[false, true, true, true, true, true]}
              />
            </Panel>
            <Panel title="By source">
              <SimpleTable
                head={["Source", "Calls", "Cost"]}
                rows={(data?.bySource || []).map((r) => [r.source === "server" ? "Server (we pay)" : "User key", num(r.calls), usd(r.cost_usd)])}
                right={[false, true, true]}
              />
            </Panel>
          </div>

          {/* By task */}
          <Panel title="By task type">
            <SimpleTable
              head={["Task", "Calls", "In", "Out", "Avg latency", "Cost"]}
              rows={(data?.byTask || []).map((t) => [t.task_type, num(t.calls), num(t.input_tokens), num(t.output_tokens), ms(t.avg_latency_ms), usd(t.cost_usd)])}
              right={[false, true, true, true, true, true]}
            />
          </Panel>

          {/* Per-task model comparison (A/B seed) */}
          <Panel title="Model comparison by task" subtitle="Cost per call per model — the basis for deciding where a cheaper model is good enough (A/B in Phase 2).">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted uppercase tracking-wider border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium">Task</th>
                    <th className="text-left py-2 pr-4 font-medium">Model</th>
                    <th className="text-right py-2 px-4 font-medium">Calls</th>
                    <th className="text-right py-2 px-4 font-medium">Avg cost/call</th>
                    <th className="text-right py-2 px-4 font-medium">Avg in/out</th>
                    <th className="text-right py-2 px-4 font-medium">Avg latency</th>
                    <th className="text-right py-2 pl-4 font-medium">Total cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {comparisonByTask.map(({ taskType, rows }) =>
                    rows.map((r, i) => (
                      <tr key={`${taskType}-${r.model}`} className="hover:bg-background/50">
                        <td className="py-2 pr-4 text-muted">{i === 0 ? taskType : ""}</td>
                        <td className="py-2 pr-4 text-foreground">{shortModel(r.model)}</td>
                        <td className="py-2 px-4 text-right">{num(r.calls)}</td>
                        <td className="py-2 px-4 text-right font-medium">{usd(r.avg_cost_usd)}</td>
                        <td className="py-2 px-4 text-right text-muted">{num(r.avg_input_tokens)}/{num(r.avg_output_tokens)}</td>
                        <td className="py-2 px-4 text-right text-muted">{ms(r.avg_latency_ms)}</td>
                        <td className="py-2 pl-4 text-right">{usd(r.cost_usd)}</td>
                      </tr>
                    ))
                  )}
                  {comparisonByTask.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-muted">No usage recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Tavily breakdown */}
          {(data?.tavily.byTask.length ?? 0) > 0 && (
            <Panel title="Tavily searches" subtitle="$0.008 per credit (basic search = 1 credit).">
              <SimpleTable
                head={["Task", "Searches", "Credits", "Cost"]}
                rows={(data?.tavily.byTask || []).map((t) => [t.task_type, num(t.calls), num(t.credits), usd(t.cost_usd)])}
                right={[false, true, true, true]}
              />
            </Panel>
          )}

          {/* ElevenLabs breakdown */}
          {(data?.elevenLabs.byTask.length ?? 0) > 0 && (
            <Panel title="ElevenLabs (text-to-speech)" subtitle="Spoken verdict narration. Cost is an estimate — ~$0.18 per 1k characters (plan-dependent; set ELEVENLABS_USD_PER_1K_CHARS).">
              <SimpleTable
                head={["Task", "Clips", "Characters", "Cost"]}
                rows={(data?.elevenLabs.byTask || []).map((t) => [t.task_type, num(t.calls), num(t.characters), usd(t.cost_usd)])}
                right={[false, true, true, true]}
              />
            </Panel>
          )}

          {/* Daily spend */}
          {(data?.byDay.length ?? 0) > 0 && (
            <Panel title="Daily spend (Claude)">
              <DailyBars rows={data!.byDay} />
            </Panel>
          )}

          {/* Recent calls (sortable) */}
          <Panel title={`Recent calls (${sortedRecent.length})`} subtitle="Click a column to sort.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted uppercase tracking-wider border-b border-border">
                    <SortTh label="When" k="created_at" {...{ sortKey, sortDir, toggleSort }} />
                    <SortTh label="Task" k="task_type" {...{ sortKey, sortDir, toggleSort }} />
                    <SortTh label="Model" k="model" {...{ sortKey, sortDir, toggleSort }} />
                    <SortTh label="Source" k="source" {...{ sortKey, sortDir, toggleSort }} />
                    <SortTh label="In" k="input_tokens" right {...{ sortKey, sortDir, toggleSort }} />
                    <SortTh label="Out" k="output_tokens" right {...{ sortKey, sortDir, toggleSort }} />
                    <SortTh label="Latency" k="latency_ms" right {...{ sortKey, sortDir, toggleSort }} />
                    <SortTh label="Cost" k="cost_usd" right {...{ sortKey, sortDir, toggleSort }} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sortedRecent.map((r) => (
                    <tr key={r.id} className={`hover:bg-background/50 ${!r.success ? "text-fail" : ""}`}>
                      <td className="py-2 pr-4 text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4">{r.task_type}</td>
                      <td className="py-2 pr-4 text-muted">{shortModel(r.model)}</td>
                      <td className="py-2 pr-4 text-muted">{r.source}</td>
                      <td className="py-2 px-4 text-right">{num(r.input_tokens)}</td>
                      <td className="py-2 px-4 text-right">{num(r.output_tokens)}</td>
                      <td className="py-2 px-4 text-right text-muted">{ms(r.latency_ms)}</td>
                      <td className="py-2 pl-4 text-right font-medium">{usd(r.cost_usd)}</td>
                    </tr>
                  ))}
                  {sortedRecent.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-muted">No calls in this window.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          </>
          )}
        </div>
      </main>
    </div>
  );
}

// ── A/B model split editor ────────────────────────────────────────────────────
function AbPanel() {
  const [tasks, setTasks] = useState<AbTask[]>([]);
  const [draft, setDraft] = useState<Record<string, Record<Tier, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/model-ab");
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (cancelled) return;
        const ts: AbTask[] = d.tasks || [];
        setTasks(ts);
        const dr: Record<string, Record<Tier, number>> = {};
        for (const t of ts) {
          const w = (d.config || {})[t.task] || {};
          dr[t.task] = { opus: Number(w.opus) || 0, sonnet: Number(w.sonnet) || 0, haiku: Number(w.haiku) || 0 };
        }
        setDraft(dr);
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setWeight = (task: string, tier: Tier, val: string) => {
    setSaved(false);
    const n = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
    setDraft((d) => ({ ...d, [task]: { ...d[task], [tier]: n } }));
  };
  const quickSet = (task: string, weights: Record<Tier, number>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [task]: { ...weights } }));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const config: Record<string, Partial<Record<Tier, number>>> = {};
    for (const [task, w] of Object.entries(draft)) {
      const entry: Partial<Record<Tier, number>> = {};
      let total = 0;
      for (const tier of TIERS) {
        const n = Number(w[tier]) || 0;
        if (n > 0) { entry[tier] = n; total += n; }
      }
      if (total > 0) config[task] = entry;
    }
    try {
      const r = await fetch("/api/admin/model-ab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (r.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const effective = (task: string, defaultTier: Tier) => {
    const w = draft[task] || ({} as Record<Tier, number>);
    const active = TIERS.filter((t) => (w[t] || 0) > 0);
    if (active.length === 0) return `default · ${defaultTier}`;
    const total = active.reduce((s, t) => s + (w[t] || 0), 0);
    return active.map((t) => `${t} ${Math.round(((w[t] || 0) / total) * 100)}%`).join(" / ");
  };

  return (
    <Panel
      title="A/B model split"
      subtitle="Weighted % per task. Each request rolls a model by these weights and records the arm. Leave a row at 0/0/0 to use its default tier (no experiment)."
    >
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted uppercase tracking-wider border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium">Task</th>
                  <th className="text-center py-2 px-2 font-medium">Opus %</th>
                  <th className="text-center py-2 px-2 font-medium">Sonnet %</th>
                  <th className="text-center py-2 px-2 font-medium">Haiku %</th>
                  <th className="text-left py-2 px-3 font-medium">Effective</th>
                  <th className="text-right py-2 pl-2 font-medium">Quick</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {tasks.map((t) => (
                  <tr key={t.task} className="hover:bg-background/50">
                    <td className="py-2 pr-4 text-foreground">{t.label}</td>
                    {TIERS.map((tier) => (
                      <td key={tier} className="py-2 px-2 text-center">
                        <input
                          type="number" min={0} max={100}
                          value={draft[t.task]?.[tier] ?? 0}
                          onChange={(e) => setWeight(t.task, tier, e.target.value)}
                          className="w-16 px-2 py-1 bg-card border border-border rounded text-center text-foreground text-sm focus:outline-none focus:border-accent"
                        />
                      </td>
                    ))}
                    <td className="py-2 px-3 text-muted text-xs">{effective(t.task, t.defaultTier)}</td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <button onClick={() => quickSet(t.task, { opus: 50, sonnet: 50, haiku: 0 })}
                        className="text-xs px-2 py-1 rounded border border-border hover:border-accent text-muted hover:text-foreground transition-colors cursor-pointer">50/50</button>
                      <button onClick={() => quickSet(t.task, { opus: 0, sonnet: 0, haiku: 0 })}
                        className="ml-1 text-xs px-2 py-1 rounded border border-border hover:border-fail text-muted hover:text-fail transition-colors cursor-pointer">Reset</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50">
              {saving ? "Saving…" : "Save split"}
            </button>
            {saved && <span className="text-sm text-success">Saved · applies within ~30s</span>}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── Small presentational components ───────────────────────────────────────────
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
        active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-accent/40 bg-accent/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-accent" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

function SimpleTable({ head, rows, right }: { head: string[]; rows: (string | number)[][]; right: boolean[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted uppercase tracking-wider border-b border-border">
            {head.map((h, i) => (
              <th key={h} className={`py-2 font-medium ${right[i] ? "text-right pl-4" : "text-left pr-4"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-background/50">
              {row.map((cell, ci) => (
                <td key={ci} className={`py-2 ${right[ci] ? "text-right pl-4" : "text-left pr-4"} ${right[ci] ? "" : "text-foreground"}`}>{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={head.length} className="py-6 text-center text-muted">No data.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortTh({ label, k, right, sortKey, sortDir, toggleSort }: {
  label: string; k: SortKey; right?: boolean; sortKey: SortKey; sortDir: "asc" | "desc"; toggleSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => toggleSort(k)}
      className={`py-2 font-medium cursor-pointer select-none hover:text-foreground ${right ? "text-right pl-4" : "text-left pr-4"} ${active ? "text-foreground" : ""}`}
    >
      {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
}

function DailyBars({ rows }: { rows: { day: string; cost_usd: number; calls: number }[] }) {
  const max = Math.max(...rows.map((r) => Number(r.cost_usd)), 0.000001);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.day} className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0 text-muted">{r.day}</span>
          <div className="flex-1 h-4 bg-background rounded overflow-hidden">
            <div className="h-full bg-accent/60" style={{ width: `${(Number(r.cost_usd) / max) * 100}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right text-foreground">{usd(r.cost_usd)}</span>
          <span className="w-16 shrink-0 text-right text-muted">{num(r.calls)}</span>
        </div>
      ))}
    </div>
  );
}

// Strip the "claude-" prefix and trailing date for readability in tables.
function shortModel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}
