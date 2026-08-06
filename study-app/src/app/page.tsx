"use client";

// Home launcher (docs/design/2026-08-06-shell-redesign/ §2): a thin springboard, not a dashboard
// and not a doing-page. Continue card → nudge bar → pillar tiles → recent verdicts. The Dry
// Flights wizard this page used to host lives at /practical/dry-flights.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ShellOnboarding } from "./components/ShellOnboarding";

const MODE_LABELS: Record<string, string> = {
  full: "Full Question",
  "stem-only": "Stem Analysis Only",
  "known-wine": "Dry Notes",
  flash: "Flash Notes",
};

interface HistoryAttempt {
  id: number;
  mode: string | null;
  pass_estimate: string | null;
  started_at: string;
  completed_at: string | null;
  paper: number | null;
  family_label: string | null;
  question_text: string | null;
  question_id: string;
}

interface TheoryDraft {
  questionId: string;
  words: number;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function greetingForHour(hour: number) {
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function daysUntil(dateISO: string): number | null {
  const target = new Date(`${dateISO}T00:00:00`);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function relativeWhen(iso: string) {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function verdictPill(passEstimate: string | null) {
  const verdict = (passEstimate || "").toLowerCase();
  if (verdict === "pass") return { label: "PASS", cls: "text-success bg-success/12" };
  if (verdict === "borderline") return { label: "BORDERLINE", cls: "text-borderline bg-borderline/12" };
  if (verdict === "fail") return { label: "FAIL", cls: "text-fail bg-fail/12" };
  return null;
}

// The data-driven nudge (§2): the paper whose recent full-mode flights failed most. One line, one
// action — never a dashboard.
function computeNudge(attempts: HistoryAttempt[]) {
  const byPaper = new Map<number, { fails: number; total: number }>();
  for (const attempt of attempts) {
    if (attempt.mode === "theory" || !attempt.paper || !attempt.pass_estimate) continue;
    const entry = byPaper.get(attempt.paper) ?? { fails: 0, total: 0 };
    if (entry.total >= 6) continue;
    entry.total += 1;
    if (attempt.pass_estimate.toLowerCase() === "fail") entry.fails += 1;
    byPaper.set(attempt.paper, entry);
  }
  let worst: { paper: number; fails: number; total: number } | null = null;
  for (const [paper, { fails, total }] of byPaper) {
    if (total < 3 || fails < 2) continue;
    if (!worst || fails / total > worst.fails / worst.total) worst = { paper, fails, total };
  }
  return worst;
}

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [attempts, setAttempts] = useState<HistoryAttempt[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [theoryStats, setTheoryStats] = useState<{ count: number; papers: number; yearMin: number; yearMax: number } | null>(null);
  const [theoryDraft, setTheoryDraft] = useState<TheoryDraft | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAttempts((data?.attempts as HistoryAttempt[]) ?? []))
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
    fetch("/api/theory/questions?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.count) setTheoryStats(data); })
      .catch(() => {});
  }, [user]);

  // An in-progress theory essay lives client-side (mw-draft:theory:{id}); surface the longest one.
  useEffect(() => {
    try {
      let best: TheoryDraft | null = null;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith("mw-draft:theory:")) continue;
        const text = window.localStorage.getItem(key) ?? "";
        const words = (text.match(/\b[\w'-]+\b/g) ?? []).length;
        if (words < 20) continue;
        if (!best || words > best.words) {
          best = { questionId: key.slice("mw-draft:theory:".length), words };
        }
      }
      setTheoryDraft(best);
    } catch {}
  }, []);

  // Hidden egg: typing "mikey" anywhere on the launcher opens Lil' Mikey's Wine Adventure.
  useEffect(() => {
    let typed = "";
    const onKey = (event: KeyboardEvent) => {
      if (event.key.length !== 1) return;
      typed = (typed + event.key.toLowerCase()).slice(-5);
      if (typed === "mikey") router.push("/mikey");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const nudge = useMemo(() => computeNudge(attempts), [attempts]);
  const recent = useMemo(() => attempts.slice(0, 4), [attempts]);

  if (authLoading || !user) return null;

  const config = user.lastDrillConfig;
  const continueTitle = config?.paper && config.mode
    ? `Dry Flights · Paper ${config.paper} · ${MODE_LABELS[config.mode] ?? config.mode}`
    : null;
  const examDays = user.examDate ? daysUntil(user.examDate) : null;
  const now = new Date();
  const dateLine = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex-1">
      <ShellOnboarding />
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        {/* Greeting row */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {greetingForHour(now.getHours())}, {firstName(user.name)}
          </h1>
          <p className="text-xs text-muted">
            {dateLine}
            {examDays !== null && examDays >= 0 && <> · {examDays} days to Stage 2</>}
          </p>
        </div>

        {/* Continue card — the only amber-bordered card in the app */}
        {(continueTitle || theoryDraft) && (
          <div data-tour="continue" className="bg-card rounded-xl border border-accent p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-accent mb-1">Continue</p>
              <p className="text-sm font-semibold text-foreground">
                {continueTitle ?? "Theory essay in progress"}
              </p>
              <p className="text-xs text-muted mt-1">
                {continueTitle
                  ? "Your last drill configuration, one click away."
                  : "Pick up the essay draft where you left it."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {continueTitle && (
                <Link
                  href="/practical/dry-flights?repeat=1"
                  className="rounded-lg bg-accent hover:bg-accent-hover px-5 py-2 text-sm font-medium text-background transition-colors"
                >
                  Start same drill
                </Link>
              )}
              {theoryDraft && (
                <Link
                  href={`/theory?question=${encodeURIComponent(theoryDraft.questionId)}`}
                  className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-muted hover:text-foreground hover:border-muted transition-colors"
                >
                  Resume essay draft · {theoryDraft.words} words
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Nudge bar */}
        {nudge && (
          <div data-tour="nudge" className="rounded-xl border border-border px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">Paper {nudge.paper} is your gap</span>
              {" — "}{nudge.fails} of your last {nudge.total} P{nudge.paper} flights failed
              {examDays !== null && examDays >= 0 && <>, and it&apos;s {examDays} days out</>}.
            </p>
            <Link href="/practical/dry-flights" className="text-sm font-medium text-accent hover:text-accent-hover transition-colors">
              Drill Paper {nudge.paper} &rarr;
            </Link>
          </div>
        )}

        {/* Pillar tiles */}
        <div data-tour="pillars" className="grid sm:grid-cols-2 gap-3">
          <Link
            href="/theory"
            className="bg-card rounded-xl border border-border p-6 hover:border-muted hover:bg-card-hover transition-colors group"
          >
            <h2 className="font-display text-xl font-semibold text-foreground">Theory</h2>
            <p className="text-sm text-muted mt-1">
              Timed essays on real past questions, graded against the examiners&apos; reports.
            </p>
            <p className="text-xs text-muted mt-4">
              <span className="text-accent font-medium">
                {theoryStats ? `${theoryStats.count} questions` : "Past questions"}
              </span>
              {theoryStats && <> · {theoryStats.papers} papers · {theoryStats.yearMin}&ndash;{theoryStats.yearMax}</>}
            </p>
          </Link>
          <Link
            href="/practical"
            className="bg-card rounded-xl border border-border p-6 hover:border-muted hover:bg-card-hover transition-colors group"
          >
            <h2 className="font-display text-xl font-semibold text-foreground">Practical</h2>
            <p className="text-sm text-muted mt-1">
              Blind-tasting drills — simulated flights, and real bottles on a timer.
            </p>
            <p className="text-xs text-muted mt-4">
              <span className="text-accent font-medium">2 drills</span> · Dry Flights · Live Tastings
            </p>
          </Link>
        </div>

        {/* Recent work */}
        {historyLoaded && recent.length > 0 && (
          <div data-tour="recent">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Recent work</p>
              <Link href="/history" className="text-xs text-muted hover:text-foreground transition-colors">
                All history &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {recent.map((attempt) => {
                const pill = verdictPill(attempt.pass_estimate);
                const isTheory = attempt.mode === "theory";
                return (
                  <Link
                    key={attempt.id}
                    href="/history"
                    className="bg-card rounded-xl border border-border p-4 hover:border-muted hover:bg-card-hover transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[0.6875rem] text-muted">{relativeWhen(attempt.started_at)}</span>
                      {pill && (
                        <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${pill.cls}`}>
                          {pill.label}
                        </span>
                      )}
                    </div>
                    <p className="text-[0.8125rem] font-semibold text-foreground line-clamp-2">
                      {isTheory
                        ? attempt.question_text || "Theory essay"
                        : `${MODE_LABELS[attempt.mode ?? "full"] ?? "Flight"}${attempt.paper ? ` · Paper ${attempt.paper}` : ""}`}
                    </p>
                    <p className="text-[0.6875rem] text-muted mt-1 truncate">
                      {isTheory ? "Theory" : attempt.family_label || "Practical"}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
