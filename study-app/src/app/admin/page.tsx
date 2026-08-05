"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { HistoryView, type AttemptDetail } from "../components/HistoryView";
import { FeatureRequestPanel } from "../components/FeatureRequestPanel";
import { FillTheBankRows } from "../components/FillTheBankCard";
import { BankHealthSection } from "../components/BankHealthSection";
import { WhyBinnedSection } from "../components/WhyBinnedSection";

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

  // Auto-feature pipeline toggle (feature-build)
  const [autoFeature, setAutoFeature] = useState(false);
  const [featureHardDisabled, setFeatureHardDisabled] = useState(false);

  // Visible-reasoning toggle. Defaults ON — it's a kill switch over shipped behaviour.
  const [reasoning, setReasoning] = useState(true);
  const [reasoningHardDisabled, setReasoningHardDisabled] = useState(false);

  const toggleReasoning = async () => {
    const next = !reasoning;
    setSavingToggle(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasoning: next }),
      });
      if (res.ok) setReasoning(next);
      else setError("Failed to update Model Reasoning setting");
    } catch {
      setError("Network error");
    } finally {
      setSavingToggle(false);
    }
  };

  const toggleAutoFeature = async () => {
    const next = !autoFeature;
    if (next && !window.confirm("Turn ON Auto-Feature?\n\nWhen ON, clicking \"Build it\" on a Feature Request immediately builds the feature, verifies it in CI (typecheck + build), and — if green — merges to master and deploys to production. When OFF, \"Build it\" only saves the spec; you build it later with \"Build now\".")) {
      return;
    }
    setSavingToggle(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFeature: next }),
      });
      if (res.ok) setAutoFeature(next);
      else setError("Failed to update Auto-Feature setting");
    } catch {
      setError("Network error");
    } finally {
      setSavingToggle(false);
    }
  };

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
    // Only bounce users who aren't signed in at all. An authenticated NON-admin is deliberately kept
    // on the page so the diagnostic stripe (which reports their live admin status from the DB) can
    // surface a silent admin-gating failure instead of a gating bug silently hiding it.
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.isAdmin) {
      // no-store on every admin data fetch: the admin surface must reflect live state (and a live
      // bundle), never a CDN/browser-cached snapshot that could mask a shipped change.
      Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/feedback", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/settings", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      ])
        .then(([userData, feedbackData, settingsData]) => {
          if (userData?.users) setUsers(userData.users);
          if (feedbackData?.counts) setFeedbackCounts(feedbackData.counts);
          if (settingsData) {
            setAutoApply(!!settingsData.autoApply);
            setHardDisabled(!!settingsData.hardDisabled);
            setAutoFeature(!!settingsData.autoFeature);
            setFeatureHardDisabled(!!settingsData.featureHardDisabled);
            setReasoning(settingsData.reasoning !== false);
            setReasoningHardDisabled(!!settingsData.reasoningHardDisabled);
          }
        })
        .catch(() => setError("Failed to load data"))
        .finally(() => setLoading(false));

      // Poll live sessions
      const pollLive = () => {
        fetch("/api/admin/live-sessions", { cache: "no-store" })
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

  // Still resolving auth, or (for a confirmed admin) still loading the admin data.
  if (authLoading || (user?.isAdmin && loading)) {
    return (
      <div className="flex flex-col flex-1">
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-muted">
            <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
            <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
            <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
            <span className="ml-2 text-sm">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated but the DB no longer marks this account admin. Unauthenticated visitors are
  // redirected by the effect above.
  if (!user?.isAdmin) {
    return (
      <div className="flex flex-col flex-1">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground tracking-tight font-display">Admin</h1>
          <p className="text-sm text-muted mt-3 max-w-md mx-auto">
            This account doesn&apos;t currently have admin access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Admin</h1>
            <p className="text-sm text-muted mt-1">Manage users and monitor usage</p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            <Link
              href="/admin/costs"
              className="text-sm px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors font-medium"
            >
              Cost &amp; usage →
            </Link>
          </div>
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

          {/* Auto-Apply pipeline toggle. Fill the Bank is rendered as additional rows INSIDE this
              same settings card (below, after a border-t divider) — deliberately nested in the same
              JSX block as the Auto-Apply toggle so it can never sit on a separately-gated or
              unrendered branch. Five prior builds shipped it as a standalone card/page the admin
              never saw; keeping it here guarantees it renders wherever this toggle does. */}
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
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${autoApply ? "bg-success" : "bg-muted"}`}
              >
                {/* The knob keeps its white face (DESIGN.md sanctions it) but carries a --background
                    ring so its edge is legible on every track. White alone only managed 2.3:1 on the
                    green on-track in dark mode; the ring clears 3:1 against success, accent and muted
                    in both themes. Same treatment on all three switches below. */}
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white ring-2 ring-background transition-transform ${autoApply ? "translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>

            {/* Fill the Bank — additional rows inside the Auto-Apply card, below the toggle, split by
                a 1px border-t divider (spec). Same JSX block as the toggle above. */}
            <div className="mt-5 pt-5 border-t border-border">
              <FillTheBankRows />
            </div>
          </div>

          {/* Bank Health — rendered inline immediately below the bank counts card (full width). A
              prior standalone /admin/bank-health page 404'd in production, so it lives here, in the
              same JSX block that always renders, guaranteeing it ships wherever this page does. */}
          <BankHealthSection />

          {/* Why wines get binned — the bin learning-loop summary (reason volumes + recent notes). */}
          <WhyBinnedSection />

          {/* Auto-Feature pipeline toggle */}
          <div className={`rounded-xl border-2 p-5 mb-6 ${autoFeature ? "border-accent bg-accent/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-foreground">Auto-Feature</h2>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${autoFeature ? "bg-accent/20 text-accent" : "bg-muted/20 text-muted"}`}>
                    {autoFeature ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1 max-w-xl">
                  When ON, clicking <span className="font-semibold">Build it</span> on a Feature Request immediately
                  builds the feature, verifies it in CI (typecheck + build, with self-heal), and — if green —
                  merges to <code className="text-foreground">master</code> and deploys to production. When OFF,
                  Build it just saves the spec; build it later with <span className="font-semibold">Build now</span>.
                </p>
                {featureHardDisabled && (
                  <p className="text-xs text-fail mt-1">Overridden OFF by <code>AUTO_FEATURE_HARD_DISABLE</code> env — toggle has no effect.</p>
                )}
              </div>
              <button
                onClick={toggleAutoFeature}
                disabled={savingToggle || featureHardDisabled}
                role="switch"
                aria-checked={autoFeature}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${autoFeature ? "bg-accent" : "bg-muted"}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white ring-2 ring-background transition-transform ${autoFeature ? "translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          {/* Model Reasoning toggle — the cost lever for streamed thinking */}
          <div className={`rounded-xl border-2 p-5 mb-6 ${reasoning ? "border-accent bg-accent/5" : "border-border bg-card"}`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-foreground">Model Reasoning</h2>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${reasoning ? "bg-accent/20 text-accent" : "bg-muted/20 text-muted"}`}>
                    {reasoning ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1 max-w-xl">
                  When ON, question generation, tasting notes, and all three graders request the
                  model&apos;s visible reasoning, which streams into the &ldquo;Show reasoning&rdquo; panel.
                  Turning it OFF stops paying thinking tokens on every one of those calls.
                  <span className="text-foreground/80"> Progress labels are unaffected either way</span> —
                  they&apos;re our own code, cost nothing, and are what stop a long wait looking hung.
                  Takes effect within 30s.
                </p>
                {reasoningHardDisabled && (
                  <p className="text-xs text-fail mt-1">Overridden OFF by <code>REASONING_HARD_DISABLE</code> env — toggle has no effect.</p>
                )}
              </div>
              {/* Off-track is full-strength --muted, matching the other two toggles: at /40 it washed
                  out to near-white on the light theme and the knob all but vanished (1.7:1). */}
              <button
                onClick={toggleReasoning}
                disabled={savingToggle || reasoningHardDisabled}
                role="switch"
                aria-checked={reasoning}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${reasoning ? "bg-accent" : "bg-muted"}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white ring-2 ring-background transition-transform ${reasoning ? "translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>
          </div>

          {/* Feature Request engine */}
          <FeatureRequestPanel autoFeature={autoFeature} />

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

          {/* Build stamp — hardcoded, unconditional. If this line is missing from a deployed /admin,
              the browser is serving a stale bundle (the whole point of the v3 verifiability gate). */}
          <p className="text-xs text-muted/60 text-center mt-10">Admin build 6 · Fill the Bank: inline</p>
        </div>
      </main>
    </div>
  );
}
