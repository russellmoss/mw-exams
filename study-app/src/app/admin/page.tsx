"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { HistoryView, type AttemptDetail } from "../components/HistoryView";

interface UserRow {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
  has_own_key: boolean;
  key_hint: string | null;
  attempt_count: number;
  completed_count: number;
  created_at: string;
  address: string | null;
  business: string | null;
  job_title: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New user form
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newBusiness, setNewBusiness] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  // Live sessions
  const [liveUserIds, setLiveUserIds] = useState<Set<number>>(new Set());

  // Feedback
  const [feedbackCounts, setFeedbackCounts] = useState({ open: 0, accepted: 0, partial: 0, rejected: 0 });
  const [modalFilter, setModalFilter] = useState<string | null>(null);
  const [modalAttempts, setModalAttempts] = useState<AttemptDetail[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Auto-apply pipeline toggle
  const [autoApply, setAutoApply] = useState(false);
  const [hardDisabled, setHardDisabled] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);

  const toggleAutoApply = async () => {
    const next = !autoApply;
    if (next && !window.confirm("Turn ON Auto-Apply?\n\nEvery feedback item the analysis marks ACCEPT will automatically rewrite code, be verified (lint + typecheck + build) in CI, and — if green — merge to master and deploy to production with NO human review.")) {
      return;
    }
    setSavingToggle(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApply: next }),
      });
      if (res.ok) setAutoApply(next);
      else setError("Failed to update Auto-Apply setting");
    } catch {
      setError("Network error");
    } finally {
      setSavingToggle(false);
    }
  };

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.push("/");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.isAdmin) {
      Promise.all([
        fetch("/api/admin/users").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/feedback").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/settings").then((r) => r.ok ? r.json() : null),
      ])
        .then(([userData, feedbackData, settingsData]) => {
          if (userData?.users) setUsers(userData.users);
          if (feedbackData?.counts) setFeedbackCounts(feedbackData.counts);
          if (settingsData) {
            setAutoApply(!!settingsData.autoApply);
            setHardDisabled(!!settingsData.hardDisabled);
          }
        })
        .catch(() => setError("Failed to load data"))
        .finally(() => setLoading(false));

      // Poll live sessions
      const pollLive = () => {
        fetch("/api/admin/live-sessions")
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data?.sessions) {
              setLiveUserIds(new Set(data.sessions.map((s: { user_id: number }) => s.user_id)));
            }
          })
          .catch(() => {});
      };
      pollLive();
      const interval = setInterval(pollLive, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const openFeedbackModal = async (status: string) => {
    setModalFilter(status);
    setModalLoading(true);
    try {
      const res = await fetch(`/api/admin/feedback?status=${status}`);
      const data = await res.json();
      setModalAttempts(data.attempts || []);
    } catch {
      setModalAttempts([]);
    } finally {
      setModalLoading(false);
    }
  };

  const toggleAdmin = async (targetId: number, currentValue: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: !currentValue }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === targetId ? { ...u, is_admin: !currentValue } : u))
        );
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update");
      }
    } catch {
      setError("Network error");
    }
  };

  const toggleActive = async (targetId: number, currentValue: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentValue }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === targetId ? { ...u, is_active: !currentValue } : u))
        );
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update");
      }
    } catch {
      setError("Network error");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          name: newName,
          password: newPassword,
          address: newAddress || undefined,
          business: newBusiness || undefined,
          jobTitle: newJobTitle || undefined,
          apiKey: newApiKey || undefined,
          isAdmin: newIsAdmin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user");
      } else {
        // Reload user list
        const listRes = await fetch("/api/admin/users");
        const listData = await listRes.json();
        if (listData.users) setUsers(listData.users);
        setShowForm(false);
        setNewEmail("");
        setNewName("");
        setNewPassword("");
        setNewAddress("");
        setNewBusiness("");
        setNewJobTitle("");
        setNewApiKey("");
        setNewIsAdmin(false);
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-muted">
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
          <span className="ml-2 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Admin</h1>
          <p className="text-sm text-muted mt-1">Manage users and monitor usage</p>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-6">
              <p className="text-sm text-fail">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-fail/70 hover:text-fail mt-1 underline cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {/* Auto-Apply pipeline toggle */}
          <div className={`rounded-xl border-2 p-5 mb-6 ${autoApply ? "border-success bg-success/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-foreground">Auto-Apply</h2>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${autoApply ? "bg-success/20 text-success" : "bg-muted/20 text-muted"}`}>
                    {autoApply ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1 max-w-xl">
                  When ON, any feedback the analysis marks <span className="font-semibold">ACCEPT</span> is auto-coded,
                  verified in CI (lint + typecheck + build, with self-heal), and — if green — merged to{" "}
                  <code className="text-foreground">master</code> and deployed to production with no human review.
                  Unverifiable changes open a PR instead. When OFF, use “Apply &amp; ship” per item.
                </p>
                {hardDisabled && (
                  <p className="text-xs text-fail mt-1">Overridden OFF by <code>AUTO_APPLY_HARD_DISABLE</code> env — toggle has no effect.</p>
                )}
              </div>
              <button
                onClick={toggleAutoApply}
                disabled={savingToggle || hardDisabled}
                role="switch"
                aria-checked={autoApply}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${autoApply ? "bg-success" : "bg-muted/40"}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${autoApply ? "translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          {/* Feedback scorecards */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <button
              onClick={() => openFeedbackModal("open")}
              className="bg-card rounded-xl border-2 border-accent/30 p-4 text-left hover:border-accent transition-colors cursor-pointer"
            >
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Open Feedback</p>
              <p className="text-3xl font-bold text-accent">{feedbackCounts.open}</p>
              <p className="text-xs text-muted mt-1">Needs review</p>
            </button>
            <button
              onClick={() => openFeedbackModal("accepted")}
              className="bg-card rounded-xl border border-border p-4 text-left hover:border-success/50 transition-colors cursor-pointer"
            >
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Accepted</p>
              <p className="text-3xl font-bold text-success">{feedbackCounts.accepted}</p>
              <p className="text-xs text-muted mt-1">
                Changes applied{feedbackCounts.partial > 0 && <span className="text-borderline"> · incl. {feedbackCounts.partial} partial</span>}
              </p>
            </button>
            <button
              onClick={() => openFeedbackModal("rejected")}
              className="bg-card rounded-xl border border-border p-4 text-left hover:border-fail/50 transition-colors cursor-pointer"
            >
              <p className="text-xs text-muted uppercase tracking-wider mb-1">Rejected</p>
              <p className="text-3xl font-bold text-fail">{feedbackCounts.rejected}</p>
              <p className="text-xs text-muted mt-1">No change needed</p>
            </button>
          </div>

          {/* Feedback modal */}
          {modalFilter && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4">
              <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setModalFilter(null)} />
              <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl">
                <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
                  <h2 className="font-semibold text-foreground">
                    {modalFilter === "open" ? "Open Feedback" : modalFilter === "accepted" ? "Accepted Feedback" : "Rejected Feedback"}
                    <span className="text-sm font-normal text-muted ml-2">({modalAttempts.length})</span>
                  </h2>
                  <button onClick={() => setModalFilter(null)} className="text-muted hover:text-foreground transition-colors cursor-pointer p-1">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6">
                  {modalLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex items-center gap-3 text-muted">
                        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
                        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
                      </div>
                    </div>
                  ) : modalAttempts.length === 0 ? (
                    <p className="text-center text-muted py-8">No feedback in this category.</p>
                  ) : (
                    <HistoryView attempts={modalAttempts} stats={null} isAdmin />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* User list */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground">
                Users ({users.length})
              </h2>
              <button
                onClick={() => setShowForm(!showForm)}
                className="text-sm px-4 py-1.5 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors cursor-pointer font-medium"
              >
                {showForm ? "Cancel" : "Add user"}
              </button>
            </div>

            {/* Create user form */}
            {showForm && (
              <div className="px-6 py-5 border-b border-border bg-background/50">
                <form onSubmit={handleCreateUser} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="Full name *" required
                      className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent" />
                    <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Email *" required
                      className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Password *" required minLength={6}
                      className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent" />
                    <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="Address"
                      className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={newBusiness} onChange={(e) => setNewBusiness(e.target.value)}
                      placeholder="Business (optional)"
                      className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent" />
                    <input type="text" value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)}
                      placeholder="Job title (optional)"
                      className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <input type="password" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder="Anthropic API key (optional, sk-ant-...)"
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted text-sm font-mono focus:outline-none focus:border-accent" />
                    <p className="text-xs text-muted mt-1">Key will be validated, encrypted, and stored securely.</p>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)}
                        className="rounded accent-accent" />
                      Admin
                    </label>
                    <button type="submit" disabled={creating}
                      className="ml-auto px-5 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50">
                      {creating ? "Creating..." : "Create user"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* User rows */}
            <div className="divide-y divide-border">
              {users.map((u) => (
                <div key={u.id} className={`px-6 py-4 flex items-center gap-4 ${!u.is_active ? "opacity-50" : ""}`}>
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    u.has_own_key ? "bg-success" : u.is_admin ? "bg-accent" : "bg-fail"
                  }`} />

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="text-sm font-medium text-foreground hover:text-accent transition-colors"
                      >
                        {u.name}
                      </Link>
                      {liveUserIds.has(u.id) && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-success/20 text-success flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                          Live
                        </span>
                      )}
                      {u.is_admin && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                          Admin
                        </span>
                      )}
                      {!u.is_active && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-fail/20 text-fail">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {u.email}
                      {u.business && <span className="ml-2 text-muted/60">{u.job_title ? `${u.job_title} at ` : ""}{u.business}</span>}
                    </p>
                  </div>

                  {/* API key status */}
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted">
                      {u.has_own_key
                        ? `Key: ${u.key_hint}`
                        : u.is_admin
                          ? "Server key"
                          : "No key"}
                    </p>
                    <p className="text-xs text-muted">
                      {u.completed_count}/{u.attempt_count} completed
                    </p>
                  </div>

                  {/* Actions */}
                  {u.id !== user?.id && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleAdmin(u.id, u.is_admin)}
                        className="text-xs px-2 py-1 rounded border border-border hover:border-accent text-muted hover:text-foreground transition-colors cursor-pointer"
                      >
                        {u.is_admin ? "Demote" : "Make admin"}
                      </button>
                      <button
                        onClick={() => toggleActive(u.id, u.is_active)}
                        className={`text-xs px-2 py-1 rounded border transition-colors cursor-pointer ${
                          u.is_active
                            ? "border-border hover:border-fail text-muted hover:text-fail"
                            : "border-border hover:border-success text-muted hover:text-success"
                        }`}
                      >
                        {u.is_active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
