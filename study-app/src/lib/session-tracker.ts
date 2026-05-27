// Session tracking in localStorage

export interface SessionEntry {
  questionId: string;
  paper: number;
  family: string;
  familyLabel: string;
  timestamp: number;
  passEstimate: "pass" | "fail" | "borderline" | null;
  marksEstimate: string | null;
}

const STORAGE_KEY = "mw-study-sessions";

export function loadSessions(): SessionEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SessionEntry[];
  } catch {
    return [];
  }
}

export function saveSession(entry: SessionEntry): void {
  if (typeof window === "undefined") return;
  try {
    const sessions = loadSessions();
    sessions.unshift(entry); // newest first
    // Keep last 100 sessions
    if (sessions.length > 100) sessions.length = 100;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage might be full or disabled
  }
}

export function clearSessions(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
