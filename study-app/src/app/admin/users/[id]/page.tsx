"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { HistoryView, type AttemptDetail, type Stats } from "../../../components/HistoryView";

export default function AdminUserHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const [attempts, setAttempts] = useState<AttemptDetail[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) router.push("/");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user?.isAdmin || !userId) return;
    fetch(`/api/history?userId=${userId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAttempts(data.attempts || []);
        setStats(data.stats || null);
        setUserName(data.userName || `User ${userId}`);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load user history:", err);
        setError("Failed to load user history");
        setLoading(false);
      });
  }, [user, userId]);

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
                <span className="ml-2 text-sm">Loading user history...</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="mb-8">
            <button
              onClick={() => router.push("/admin")}
              className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer mb-4 inline-block"
            >
              &larr; Back to Admin
            </button>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {userName}&apos;s History
            </h1>
            <p className="text-sm text-muted mt-1">
              Viewing study history as admin (read-only)
            </p>
          </div>

          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-fail">{error}</p>
            </div>
          )}

          <HistoryView
            attempts={attempts}
            stats={stats}
            isAdmin
          />
        </div>
      </main>
    </div>
  );
}
