// Shared Pace module — a per-wine benchmark timer + post-attempt pace report for Full Question
// (mode 'full') and Dry Notes (mode 'known-wine'). Pure (no server deps) so both the client
// (PaceStrip, PaceReport, history badge) and the server (save-attempt, preferences) import from
// one place.
//
// The clock never blocks: it always counts up. The pace only sets the BENCHMARK used for colouring
// and reporting. There is deliberately no "no limit" option.

export type PaceMode = "exam" | "speed";
export type SpeedSeconds = 480 | 540;

// Exam Pace is fixed at 11:00 per wine. Speed Notes is user-configured (8 or 9 minutes).
export const EXAM_PACE_SECONDS = 660;
export const SPEED_PACE_OPTIONS: readonly SpeedSeconds[] = [480, 540];

export interface PacePreference {
  pace: PaceMode;
  speedSeconds: SpeedSeconds;
}

// System default: Exam Pace, with Speed Notes defaulting to 8 min if it is ever switched on.
export const DEFAULT_PACE_PREFERENCE: PacePreference = { pace: "exam", speedSeconds: 480 };

// The attempt-level pace report persisted on user_attempts.pace (migration 021).
export interface PaceData {
  mode: PaceMode;
  benchmarkSeconds: number;
  wineTimes: number[]; // seconds, in wine order
  totalSeconds: number;
  avgSeconds: number;
  overSeconds: number; // flight total over the flight benchmark (benchmark × wine count)
}

export function isPaceMode(v: unknown): v is PaceMode {
  return v === "exam" || v === "speed";
}

export function isSpeedSeconds(v: unknown): v is SpeedSeconds {
  return v === 480 || v === 540;
}

// The per-wine benchmark in seconds for a given preference.
export function benchmarkFor(pace: PaceMode, speedSeconds: SpeedSeconds): number {
  return pace === "exam" ? EXAM_PACE_SECONDS : speedSeconds;
}

// MM:SS, never negative, floored to whole seconds.
export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function paceModeLabel(mode: PaceMode): string {
  return mode === "exam" ? "Exam Pace" : "Speed Notes";
}

// "8" / "9" — the whole-minute label for a Speed Notes length.
export function speedMinutesLabel(speedSeconds: SpeedSeconds): string {
  return String(Math.round(speedSeconds / 60));
}

// The pill label on the practice screen, e.g. "Exam Pace 11:00" / "Speed Notes 8:00".
export function paceStripPillLabel(mode: PaceMode, speedSeconds: SpeedSeconds): string {
  const benchmark = benchmarkFor(mode, speedSeconds);
  return `${paceModeLabel(mode)} ${formatMMSS(benchmark)}`;
}

// The right-aligned debrief label, e.g. "Exam Pace · 11:00 per wine".
export function paceBenchmarkLabel(mode: PaceMode, benchmarkSeconds: number): string {
  return `${paceModeLabel(mode)} · ${formatMMSS(benchmarkSeconds)} per wine`;
}

// Build the persisted report from the recorded per-wine times.
export function computePaceData(opts: {
  mode: PaceMode;
  speedSeconds: SpeedSeconds;
  wineTimes: number[];
  wineCount: number;
}): PaceData {
  const benchmarkSeconds = benchmarkFor(opts.mode, opts.speedSeconds);
  const wineTimes = opts.wineTimes.map((t) => Math.max(0, Math.round(t)));
  const count = Math.max(1, opts.wineCount || wineTimes.length);
  const totalSeconds = wineTimes.reduce((a, b) => a + b, 0);
  const avgSeconds = Math.round(totalSeconds / count);
  const overSeconds = Math.max(0, totalSeconds - benchmarkSeconds * count);
  return { mode: opts.mode, benchmarkSeconds, wineTimes, totalSeconds, avgSeconds, overSeconds };
}

// Validate/normalise an arbitrary value into PaceData (for the save-attempt payload). Returns null
// if it is not a usable pace object.
export function normalizePaceData(v: unknown): PaceData | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isPaceMode(o.mode)) return null;
  const benchmarkSeconds = Number(o.benchmarkSeconds);
  if (!Number.isFinite(benchmarkSeconds) || benchmarkSeconds <= 0) return null;
  const wineTimes = Array.isArray(o.wineTimes)
    ? o.wineTimes.map((t) => Math.max(0, Math.round(Number(t) || 0)))
    : [];
  const totalSeconds = Number.isFinite(Number(o.totalSeconds))
    ? Math.max(0, Math.round(Number(o.totalSeconds)))
    : wineTimes.reduce((a, b) => a + b, 0);
  const count = Math.max(1, wineTimes.length);
  const avgSeconds = Number.isFinite(Number(o.avgSeconds))
    ? Math.max(0, Math.round(Number(o.avgSeconds)))
    : Math.round(totalSeconds / count);
  const overSeconds = Number.isFinite(Number(o.overSeconds))
    ? Math.max(0, Math.round(Number(o.overSeconds)))
    : Math.max(0, totalSeconds - benchmarkSeconds * count);
  return { mode: o.mode, benchmarkSeconds, wineTimes, totalSeconds, avgSeconds, overSeconds };
}

// The plain coaching sentence for the debrief (generated client-side from the numbers, no LLM).
export function paceCoaching(pace: PaceData): string {
  const diff = pace.avgSeconds - pace.benchmarkSeconds;
  if (diff > 0) {
    const projMinutes = Math.max(1, Math.round((diff * 12) / 60));
    return `You averaged ${formatMMSS(diff)} over — at this pace twelve wines would run ~${projMinutes} minute${projMinutes === 1 ? "" : "s"} long.`;
  }
  if (diff < 0) {
    return `You averaged ${formatMMSS(-diff)} under benchmark — comfortably within ${paceModeLabel(pace.mode).toLowerCase()}.`;
  }
  return `You landed exactly on benchmark — ${formatMMSS(pace.benchmarkSeconds)} per wine.`;
}

// The history badge, e.g. "Exam Pace · avg 12:10" / "Speed Notes 8 · avg 8:40". `over` drives the
// colour (red if the average is over benchmark, muted stone if within).
export function paceBadge(pace: PaceData): { label: string; over: boolean } {
  const isSpeed = pace.mode === "speed";
  const speedTag = isSpeed && isSpeedSeconds(pace.benchmarkSeconds)
    ? ` ${speedMinutesLabel(pace.benchmarkSeconds)}`
    : "";
  const label = `${paceModeLabel(pace.mode)}${speedTag} · avg ${formatMMSS(pace.avgSeconds)}`;
  return { label, over: pace.avgSeconds > pace.benchmarkSeconds };
}
