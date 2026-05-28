"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { HistoryView, type AttemptDetail, type Stats } from "../components/HistoryView";

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [attempts, setAttempts] = useState<AttemptDetail[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/history")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setAttempts(data.attempts || []); setStats(data.stats || null); setLoading(false); })
      .catch((err) => { console.error("Failed to load history:", err); setError("Failed to load history"); setLoading(false); });
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-col flex-1">
        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-3 text-muted">
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
                <span className="ml-2 text-sm">Loading history...</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col flex-1">
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Study History</h1>
            <p className="text-sm text-muted mt-1">Track your progress across practice sessions</p>
          </div>

          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-fail">{error}</p>
            </div>
          )}

          <HistoryView
            attempts={attempts}
            stats={stats}
            isAdmin={user?.isAdmin}
            emptyAction={
              <button onClick={() => router.push("/")} className="mt-4 px-6 py-2 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer">
                Start Studying
              </button>
            }
          />
        </div>
      </main>

      <footer className="border-t border-border mt-auto">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <p className="text-xs text-muted text-center">Built for MW practical exam preparation. Powered by Claude.</p>
        </div>
      </footer>
    </div>
  );
}
