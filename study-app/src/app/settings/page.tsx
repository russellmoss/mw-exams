"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_PACE_PREFERENCE,
  formatMMSS,
  type PaceMode,
  type SpeedSeconds,
} from "@/lib/pace";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, refresh } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [keyInfo, setKeyInfo] = useState<{
    hasKey: boolean;
    keyHint: string | null;
    usingServerKey: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tavilyKey, setTavilyKey] = useState("");
  const [tavilyKeyInfo, setTavilyKeyInfo] = useState<{
    hasKey: boolean;
    keyHint: string | null;
    usingServerKey: boolean;
  } | null>(null);
  const [tavilySaving, setTavilySaving] = useState(false);
  const [tavilyDeleting, setTavilyDeleting] = useState(false);
  const [tavilyError, setTavilyError] = useState<string | null>(null);
  const [tavilySuccess, setTavilySuccess] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundLoading, setSoundLoading] = useState(false);
  const [paceMode, setPaceMode] = useState<PaceMode>(DEFAULT_PACE_PREFERENCE.pace);
  const [paceSpeedSeconds, setPaceSpeedSeconds] = useState<SpeedSeconds>(DEFAULT_PACE_PREFERENCE.speedSeconds);
  const [paceSaving, setPaceSaving] = useState(false);
  const [studyDefaults, setStudyDefaults] = useState<{
    questionSource: "banked" | "fresh";
    reasoningStream: boolean;
  } | null>(null);
  const [studySaving, setStudySaving] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [liveCity, setLiveCity] = useState("");
  const [liveState, setLiveState] = useState("");
  const [liveCountry, setLiveCountry] = useState("");
  const [liveBudget, setLiveBudget] = useState("");
  const [liveCurrency, setLiveCurrency] = useState("USD");
  const [liveRadius, setLiveRadius] = useState("30");
  const [liveSaving, setLiveSaving] = useState(false);
  const [liveMsg, setLiveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [replayState, setReplayState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const loadKeyInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/user/api-key");
      if (res.ok) {
        const data = await res.json();
        setKeyInfo(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTavilyKeyInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/user/api-key?provider=tavily");
      if (res.ok) {
        const data = await res.json();
        setTavilyKeyInfo(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetch("/api/user/sound-preference")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setSoundEnabled(d.soundEnabled !== false); })
        .catch(() => {});
      fetch("/api/user/pace-preference")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d) return;
          if (d.pace === "exam" || d.pace === "speed") setPaceMode(d.pace);
          if (d.speedSeconds === 480 || d.speedSeconds === 540) setPaceSpeedSeconds(d.speedSeconds);
        })
        .catch(() => {});
      fetch("/api/user/live-tasting-prefs")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d) return;
          if (d.city) setLiveCity(d.city);
          if (d.state) setLiveState(d.state);
          if (d.country) setLiveCountry(d.country);
          if (d.budgetAmount != null) setLiveBudget(String(d.budgetAmount));
          if (d.budgetCurrency) setLiveCurrency(d.budgetCurrency);
          if (d.radiusMinutes) setLiveRadius(String(d.radiusMinutes));
        })
        .catch(() => {});
      fetch("/api/user/study-defaults")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d) return;
          setStudyDefaults({
            questionSource: d.questionSource === "banked" ? "banked" : "fresh",
            reasoningStream: d.reasoningStream !== false,
          });
        })
        .catch(() => {});
      fetch("/api/user/api-key?provider=tavily")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setTavilyKeyInfo(data); })
        .catch(() => {});
      fetch("/api/user/api-key")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setKeyInfo(data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch("/api/user/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save key");
      } else {
        setSuccess("API key saved and validated successfully.");
        setApiKey("");
        await loadKeyInfo();
        await refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setSuccess(null);
    setDeleting(true);

    try {
      const res = await fetch("/api/user/api-key", { method: "DELETE" });
      if (res.ok) {
        setSuccess("API key removed.");
        await loadKeyInfo();
        await refresh();
      }
    } catch {
      setError("Failed to remove key");
    } finally {
      setDeleting(false);
    }
  };

  const handleTavilySave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTavilyError(null);
    setTavilySuccess(null);
    setTavilySaving(true);

    try {
      const res = await fetch("/api/user/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: tavilyKey, provider: "tavily" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTavilyError(data.error || "Failed to save key");
      } else {
        setTavilySuccess("Tavily key saved and validated successfully.");
        setTavilyKey("");
        await loadTavilyKeyInfo();
      }
    } catch {
      setTavilyError("Network error");
    } finally {
      setTavilySaving(false);
    }
  };

  const handleTavilyDelete = async () => {
    setTavilyError(null);
    setTavilySuccess(null);
    setTavilyDeleting(true);

    try {
      const res = await fetch("/api/user/api-key?provider=tavily", { method: "DELETE" });
      if (res.ok) {
        setTavilySuccess("Tavily key removed.");
        await loadTavilyKeyInfo();
      }
    } catch {
      setTavilyError("Failed to remove key");
    } finally {
      setTavilyDeleting(false);
    }
  };

  const saveStudyDefaults = useCallback(
    async (next: { questionSource: "banked" | "fresh"; reasoningStream: boolean }) => {
      setStudySaving(true);
      // Optimistic — reflect the choice immediately; the PATCH persists it.
      setStudyDefaults(next);
      try {
        await fetch("/api/user/study-defaults", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        // The landing page reads questionSourceDefault from auth-context — refresh so the new
        // default applies without a reload.
        await refresh();
      } catch {
        // ignore — the optimistic state stays; a reload re-reads the server value
      } finally {
        setStudySaving(false);
      }
    },
    [refresh]
  );

  const DELETE_CONFIRMATION_PHRASE = "I want to delete my account";

  const handleDeleteAccount = async () => {
    setDeleteAccountError(null);
    setAccountDeleting(true);
    try {
      const res = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteAccountError(data.error || "Failed to delete account");
        setAccountDeleting(false);
        return;
      }
      // Full reload — the session cookie is gone and every piece of client auth state with it.
      window.location.href = "/login";
    } catch {
      setDeleteAccountError("Network error");
      setAccountDeleting(false);
    }
  };

  const savePace = useCallback(async (pace: PaceMode, speedSeconds: SpeedSeconds) => {
    setPaceSaving(true);
    // Optimistic — reflect the choice immediately; the PATCH persists the default.
    setPaceMode(pace);
    setPaceSpeedSeconds(speedSeconds);
    try {
      await fetch("/api/user/pace-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pace, speedSeconds }),
      });
    } catch {
      // ignore — the optimistic state stays; a reload re-reads the server value
    } finally {
      setPaceSaving(false);
    }
  }, []);

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
        <div className="max-w-2xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-sm text-muted mt-1">Manage your account and API keys</p>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {/* Account info */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Account</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Name</span>
                <span className="text-foreground">{user?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Email</span>
                <span className="text-foreground">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Role</span>
                <span className={`font-medium ${user?.isAdmin ? "text-accent" : "text-foreground"}`}>
                  {user?.isAdmin ? "Admin" : "Member"}
                </span>
              </div>
            </div>
          </section>

          {/* Change Password */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Change Password</h2>
            {pwError && (
              <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-fail">{pwError}</p>
              </div>
            )}
            {pwSuccess && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-success">{pwSuccess}</p>
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPwError(null);
                setPwSuccess(null);
                setPwSaving(true);
                try {
                  const res = await fetch("/api/user/change-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ newPassword: newPw }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setPwError(data.error || "Failed to change password");
                  } else {
                    setPwSuccess("Password changed successfully.");
                    setNewPw("");
                  }
                } catch {
                  setPwError("Network error");
                } finally {
                  setPwSaving(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="newPw" className="block text-sm font-medium text-foreground mb-1.5">
                  New password
                </label>
                <input
                  id="newPw"
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={pwSaving || newPw.length < 6}
                className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pwSaving ? "Changing..." : "Change password"}
              </button>
            </form>
          </section>

          {/* API Key section */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Anthropic API Key</h2>
            <p className="text-sm text-muted mb-6">
              This app uses Claude to generate questions, tasting notes, and feedback.
              {user?.isAdmin
                ? " As an admin, the server key is used as a fallback if you don't set your own."
                : " You must provide your own API key to use the app."}
            </p>

            {/* Current key status */}
            {keyInfo && (
              <div className={`rounded-lg p-4 mb-6 ${
                keyInfo.hasKey
                  ? "bg-success/10 border border-success/30"
                  : keyInfo.usingServerKey
                    ? "bg-accent/10 border border-accent/30"
                    : "bg-fail/10 border border-fail/30"
              }`}>
                {keyInfo.hasKey ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Personal key active</p>
                      <p className="text-xs text-muted mt-0.5">Key ending in {keyInfo.keyHint}</p>
                    </div>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-xs text-fail hover:text-fail/80 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deleting ? "Removing..." : "Remove key"}
                    </button>
                  </div>
                ) : keyInfo.usingServerKey ? (
                  <div>
                    <p className="text-sm font-medium text-foreground">Using server key (admin fallback)</p>
                    <p className="text-xs text-muted mt-0.5">You can optionally set your own key below.</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-fail">No API key configured</p>
                    <p className="text-xs text-muted mt-0.5">Add your Anthropic API key below to start using the app.</p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-fail">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-success">{success}</p>
              </div>
            )}

            {/* How to get a key — show when user has no key */}
            {keyInfo && !keyInfo.hasKey && !keyInfo.usingServerKey && (
              <div className="bg-background rounded-lg border border-border p-4 mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">How to get your Anthropic API key</h3>
                <ol className="space-y-2 text-sm text-muted list-decimal list-inside">
                  <li>
                    Go to{" "}
                    <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      console.anthropic.com
                    </a>{" "}
                    and create a free account (or sign in).
                  </li>
                  <li>
                    Navigate to{" "}
                    <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      Settings &rarr; Billing
                    </a>{" "}
                    and add a payment method. You only pay for what you use — a typical study session costs less than $0.50.
                  </li>
                  <li>
                    Go to{" "}
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      Settings &rarr; API Keys
                    </a>{" "}
                    and click &quot;Create Key&quot;. Give it a name like &quot;MW Study App&quot;.
                  </li>
                  <li>
                    Copy the key (starts with <code className="text-xs bg-card px-1 py-0.5 rounded font-mono">sk-ant-...</code>) and paste it below.
                  </li>
                </ol>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-foreground mb-1.5">
                  {keyInfo?.hasKey ? "Replace API key" : "API key"}
                </label>
                <input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors font-mono text-sm"
                />
                <p className="text-xs text-muted mt-1.5">
                  Your key is encrypted at rest and never exposed to other users. It is only used to make API calls on your behalf.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving || !apiKey.trim()}
                className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Validating & saving..." : keyInfo?.hasKey ? "Replace key" : "Save key"}
              </button>
            </form>
          </section>

          {/* Tavily API Key section */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Tavily API Key</h2>
            <p className="text-sm text-muted mb-6">
              This app uses Tavily to research wines on the live web &mdash; producer tech sheets, critic
              tasting notes, stockists, and fact-checking.
              {tavilyKeyInfo?.usingServerKey || user?.isAdmin
                ? " As an admin, the server key is used as a fallback if you don't set your own."
                : " You must provide your own Tavily key for web research. Without one, AI features still work but skip live web sources."}
            </p>

            {/* Current key status */}
            {tavilyKeyInfo && (
              <div className={`rounded-lg p-4 mb-6 ${
                tavilyKeyInfo.hasKey
                  ? "bg-success/10 border border-success/30"
                  : tavilyKeyInfo.usingServerKey
                    ? "bg-accent/10 border border-accent/30"
                    : "bg-fail/10 border border-fail/30"
              }`}>
                {tavilyKeyInfo.hasKey ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Personal key active</p>
                      <p className="text-xs text-muted mt-0.5">Key ending in {tavilyKeyInfo.keyHint}</p>
                    </div>
                    <button
                      onClick={handleTavilyDelete}
                      disabled={tavilyDeleting}
                      className="text-xs text-fail hover:text-fail/80 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {tavilyDeleting ? "Removing..." : "Remove key"}
                    </button>
                  </div>
                ) : tavilyKeyInfo.usingServerKey ? (
                  <div>
                    <p className="text-sm font-medium text-foreground">Using server key (admin fallback)</p>
                    <p className="text-xs text-muted mt-0.5">You can optionally set your own key below.</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-fail">No Tavily key configured</p>
                    <p className="text-xs text-muted mt-0.5">Add your Tavily API key below to enable live web research.</p>
                  </div>
                )}
              </div>
            )}

            {tavilyError && (
              <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-fail">{tavilyError}</p>
              </div>
            )}
            {tavilySuccess && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-success">{tavilySuccess}</p>
              </div>
            )}

            {/* How to get a key — show when user has no key */}
            {tavilyKeyInfo && !tavilyKeyInfo.hasKey && !tavilyKeyInfo.usingServerKey && (
              <div className="bg-background rounded-lg border border-border p-4 mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">How to get your Tavily API key</h3>
                <ol className="space-y-2 text-sm text-muted list-decimal list-inside">
                  <li>
                    Go to{" "}
                    <a href="https://app.tavily.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      app.tavily.com
                    </a>{" "}
                    and create a free account (or sign in).
                  </li>
                  <li>
                    Open your dashboard at{" "}
                    <a href="https://app.tavily.com/home" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      app.tavily.com/home
                    </a>{" "}
                    and find the <strong className="text-foreground">API Keys</strong> section on the front page.
                  </li>
                  <li>
                    Click the <strong className="text-foreground">+</strong> button, give the key a name like &quot;MW Study App&quot;, and copy it.
                  </li>
                  <li>
                    Paste the key (starts with <code className="text-xs bg-card px-1 py-0.5 rounded font-mono">tvly-...</code>) below.
                  </li>
                </ol>
              </div>
            )}

            <form onSubmit={handleTavilySave} className="space-y-4">
              <div>
                <label htmlFor="tavilyKey" className="block text-sm font-medium text-foreground mb-1.5">
                  {tavilyKeyInfo?.hasKey ? "Replace Tavily key" : "Tavily key"}
                </label>
                <input
                  id="tavilyKey"
                  type="password"
                  value={tavilyKey}
                  onChange={(e) => setTavilyKey(e.target.value)}
                  placeholder="tvly-..."
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors font-mono text-sm"
                />
                <p className="text-xs text-muted mt-1.5">
                  Your key is encrypted at rest and never exposed to other users. It is only used to run web research on your behalf.
                </p>
              </div>

              <button
                type="submit"
                disabled={tavilySaving || !tavilyKey.trim()}
                className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tavilySaving ? "Validating & saving..." : tavilyKeyInfo?.hasKey ? "Replace key" : "Save key"}
              </button>
            </form>
          </section>

          {/* Study Defaults — the onboarding choices: question source + reasoning stream */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Study Defaults</h2>
            <p className="text-sm text-muted mb-5">
              How the app spends your API credits. Banked questions and reasoning off are the
              money-savers; fresh generation and the reasoning stream are the premium experience.
            </p>

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-1">Question source</h3>
              <p className="text-xs text-muted mb-3">
                Which path the study flow leads with — the other stays one click away.
              </p>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => studyDefaults && saveStudyDefaults({ ...studyDefaults, questionSource: "banked" })}
                  disabled={studySaving || !studyDefaults}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                    studyDefaults?.questionSource === "banked"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-muted"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${studyDefaults?.questionSource === "banked" ? "border-accent" : "border-muted"}`}>
                    {studyDefaults?.questionSource === "banked" && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                  <span className="flex-1">
                    <span className={`block text-sm font-medium ${studyDefaults?.questionSource === "banked" ? "text-accent" : "text-foreground"}`}>
                      Banked questions
                    </span>
                    <span className="block text-xs text-muted mt-0.5">
                      Instant, from the reviewed pool — no model call, free on your key.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => studyDefaults && saveStudyDefaults({ ...studyDefaults, questionSource: "fresh" })}
                  disabled={studySaving || !studyDefaults}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                    studyDefaults?.questionSource === "fresh"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-muted"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${studyDefaults?.questionSource === "fresh" ? "border-accent" : "border-muted"}`}>
                    {studyDefaults?.questionSource === "fresh" && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                  <span className="flex-1">
                    <span className={`block text-sm font-medium ${studyDefaults?.questionSource === "fresh" ? "text-accent" : "text-foreground"}`}>
                      Freshly generated
                    </span>
                    <span className="block text-xs text-muted mt-0.5">
                      Written on the spot, never runs out — a real generation call on your key each time.
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Reasoning stream</h3>
              <p className="text-xs text-muted mb-3">
                Watch the model reason like an examiner while it generates and grades — the thinking
                tokens bill to your key. Off still shows free progress updates.
              </p>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => studyDefaults && saveStudyDefaults({ ...studyDefaults, reasoningStream: false })}
                  disabled={studySaving || !studyDefaults}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                    studyDefaults && !studyDefaults.reasoningStream
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-muted"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${studyDefaults && !studyDefaults.reasoningStream ? "border-accent" : "border-muted"}`}>
                    {studyDefaults && !studyDefaults.reasoningStream && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                  <span className={`text-sm font-medium ${studyDefaults && !studyDefaults.reasoningStream ? "text-accent" : "text-foreground"}`}>
                    Off — save credits
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => studyDefaults && saveStudyDefaults({ ...studyDefaults, reasoningStream: true })}
                  disabled={studySaving || !studyDefaults}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                    studyDefaults?.reasoningStream
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-muted"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${studyDefaults?.reasoningStream ? "border-accent" : "border-muted"}`}>
                    {studyDefaults?.reasoningStream && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                  <span className={`text-sm font-medium ${studyDefaults?.reasoningStream ? "text-accent" : "text-foreground"}`}>
                    On — watch the examiner think
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Notification Sound */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">Notification Sound</h2>
            <p className="text-sm text-muted mb-4">
              A sound plays when your feedback analysis is complete and ready for review.
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setSoundLoading(true);
                    const next = !soundEnabled;
                    try {
                      await fetch("/api/user/sound-preference", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ soundEnabled: next }),
                      });
                      setSoundEnabled(next);
                    } catch {} finally { setSoundLoading(false); }
                  }}
                  disabled={soundLoading}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${soundEnabled ? "bg-accent" : "bg-border"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-background rounded-full transition-transform ${soundEnabled ? "translate-x-5" : ""}`} />
                </button>
                <span className="text-sm text-foreground">
                  {soundEnabled ? "Sound on" : "Sound muted"}
                </span>
              </div>
              <button
                onClick={() => {
                  const a = new Audio("/notification.mp3");
                  a.volume = 0.7;
                  a.play().catch(() => {});
                }}
                className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer"
              >
                Preview sound
              </button>
            </div>
          </section>

          {/* Exam countdown + first-run intro/tour replay (shell redesign, migration 050) */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Exam &amp; Home</h2>
            <p className="text-sm text-muted mb-5">
              Your Stage 2 exam date drives the countdown on the home page and in the coaching
              nudge. Leave it empty to hide the countdown.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <input
                type="date"
                defaultValue={user?.examDate ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  fetch("/api/user/shell-prefs", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ examDate: value || null }),
                  }).then(() => refresh()).catch(() => {});
                }}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-muted">Saved automatically</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
              {/* Resets ALL FOUR first-run flags, which is what "as if it were my first time" means.
                  It used to clear only intro_seen and tour_seen, so the two walkthroughs in between —
                  the diagrams and the Coach — stayed suppressed and the replay silently skipped the
                  longest, most useful part of onboarding. Every stage the chain in ShellOnboarding
                  knows about has to be listed here; a new stage that forgets to is invisible until
                  someone notices it never replays. */}
              <button
                disabled={replayState === "saving"}
                onClick={async () => {
                  setReplayState("saving");
                  // The chain runs at most once per browser session; without clearing this, the reset
                  // would not take effect until a new tab.
                  try { window.sessionStorage.removeItem("mw-intro-shown-this-session"); } catch {}
                  try {
                    const res = await fetch("/api/user/shell-prefs", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        introSeen: false,
                        walkthroughSeen: false,
                        coachWalkthroughSeen: false,
                        tourSeen: false,
                      }),
                    });
                    if (!res.ok) throw new Error(String(res.status));
                    await refresh();
                    setReplayState("done");
                  } catch {
                    // Say so rather than looking like nothing happened — the old version swallowed
                    // every failure into an empty .catch().
                    setReplayState("error");
                  }
                }}
                className={`rounded-lg border px-4 py-2 text-sm transition-colors cursor-pointer disabled:opacity-60 ${
                  replayState === "done"
                    ? "border-success bg-success/10 text-success"
                    : replayState === "error"
                      ? "border-fail bg-fail/10 text-fail"
                      : "border-border text-muted hover:text-foreground hover:border-muted"
                }`}
              >
                {replayState === "saving"
                  ? "Resetting…"
                  : replayState === "done"
                    ? "✓ Reset — it'll run next time"
                    : replayState === "error"
                      ? "Didn't save — try again"
                      : "Replay the full first-run tour"}
              </button>
              <span className="text-xs text-muted">
                {replayState === "done"
                  ? "Open the home page and you'll get the intro, the diagram walkthrough, the Coach walkthrough and the tour, in order."
                  : "Resets all four: the intro, the diagram walkthrough, the Coach walkthrough and the spotlight tour."}
              </span>
            </div>
          </section>

          {/* Live Tasting — where the user shops + per-bottle budget */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Live Tasting</h2>
            <p className="text-sm text-muted mb-5">
              Live Tasting builds a blind flight from wines you can actually buy near you. Set your
              market and a per-bottle budget; you can adjust the budget per session.
            </p>
            {liveMsg && (
              <div className={`rounded-lg p-3 mb-4 border ${liveMsg.kind === "ok" ? "bg-success/10 border-success/30" : "bg-fail/10 border-fail/30"}`}>
                <p className={`text-sm ${liveMsg.kind === "ok" ? "text-success" : "text-fail"}`}>{liveMsg.text}</p>
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLiveMsg(null);
                setLiveSaving(true);
                try {
                  const res = await fetch("/api/user/live-tasting-prefs", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      city: liveCity,
                      state: liveState.trim() || null,
                      country: liveCountry,
                      budgetAmount: liveBudget.trim() ? Number(liveBudget) : null,
                      budgetCurrency: liveCurrency,
                      radiusMinutes: Number(liveRadius),
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) setLiveMsg({ kind: "err", text: data.error || "Failed to save" });
                  else setLiveMsg({ kind: "ok", text: "Live Tasting market saved." });
                } catch {
                  setLiveMsg({ kind: "err", text: "Network error" });
                } finally {
                  setLiveSaving(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="liveCity" className="block text-sm font-medium text-foreground mb-1.5">
                    City / town
                  </label>
                  <input
                    id="liveCity"
                    type="text"
                    value={liveCity}
                    onChange={(e) => setLiveCity(e.target.value)}
                    placeholder="e.g. New Hope"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="liveState" className="block text-sm font-medium text-foreground mb-1.5">
                    State / region <span className="text-muted font-normal">(optional)</span>
                  </label>
                  <input
                    id="liveState"
                    type="text"
                    value={liveState}
                    onChange={(e) => setLiveState(e.target.value)}
                    placeholder="e.g. Pennsylvania"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors text-sm"
                  />
                  <p className="text-xs text-muted mt-1.5">Helps if you&rsquo;re outside a major city.</p>
                </div>
                <div>
                  <label htmlFor="liveCountry" className="block text-sm font-medium text-foreground mb-1.5">
                    Country
                  </label>
                  <input
                    id="liveCountry"
                    type="text"
                    value={liveCountry}
                    onChange={(e) => setLiveCountry(e.target.value)}
                    placeholder="e.g. United States"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                <div>
                  <label htmlFor="liveRadius" className="block text-sm font-medium text-foreground mb-1.5">
                    Willing to drive
                  </label>
                  <select
                    id="liveRadius"
                    value={liveRadius}
                    onChange={(e) => setLiveRadius(e.target.value)}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors text-sm cursor-pointer"
                  >
                    <option value="15">~15 min</option>
                    <option value="30">~30 min</option>
                    <option value="60">~1 hour</option>
                    <option value="90">~1.5 hours</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="liveBudget" className="block text-sm font-medium text-foreground mb-1.5">
                    Budget per bottle
                  </label>
                  <input
                    id="liveBudget"
                    type="number"
                    min="1"
                    step="1"
                    value={liveBudget}
                    onChange={(e) => setLiveBudget(e.target.value)}
                    placeholder="40"
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="liveCurrency" className="block text-sm font-medium text-foreground mb-1.5">
                    Currency
                  </label>
                  <select
                    id="liveCurrency"
                    value={liveCurrency}
                    onChange={(e) => setLiveCurrency(e.target.value)}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors text-sm cursor-pointer"
                  >
                    <option value="USD">USD $</option>
                    <option value="EUR">EUR €</option>
                    <option value="GBP">GBP £</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={liveSaving || !liveCity.trim() || !liveCountry.trim()}
                className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {liveSaving ? "Saving..." : "Save market"}
              </button>
            </form>
          </section>

          {/* Pace — per-wine benchmark for Full Question & Dry Notes */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Pace</h2>
            <p className="text-sm text-muted mb-5">
              Your default pace. You can switch it for a single session on the practice screen.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => savePace("exam", paceSpeedSeconds)}
                disabled={paceSaving}
                className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                  paceMode === "exam"
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${paceMode === "exam" ? "border-accent" : "border-muted"}`}>
                  {paceMode === "exam" && <span className="w-2 h-2 rounded-full bg-accent" />}
                </span>
                <span className={`text-sm font-medium ${paceMode === "exam" ? "text-accent" : "text-foreground"}`}>
                  Exam Pace — 11:00 per wine
                </span>
              </button>

              <button
                type="button"
                onClick={() => savePace("speed", paceSpeedSeconds)}
                disabled={paceSaving}
                className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                  paceMode === "speed"
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${paceMode === "speed" ? "border-accent" : "border-muted"}`}>
                  {paceMode === "speed" && <span className="w-2 h-2 rounded-full bg-accent" />}
                </span>
                <span className={`text-sm font-medium ${paceMode === "speed" ? "text-accent" : "text-foreground"}`}>
                  Speed Notes
                </span>
              </button>

              {paceMode === "speed" && (
                <div className="flex items-center gap-2 pl-7">
                  {([480, 540] as SpeedSeconds[]).map((secs) => (
                    <button
                      key={secs}
                      type="button"
                      onClick={() => savePace("speed", secs)}
                      disabled={paceSaving}
                      className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer disabled:opacity-60 ${
                        paceSpeedSeconds === secs
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-muted hover:text-foreground hover:border-muted"
                      }`}
                    >
                      {secs === 480 ? "8 min" : "9 min"} · {formatMMSS(secs)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Danger Zone — delete account */}
          <section className="bg-card rounded-xl border border-fail/30 p-6">
            <h2 className="text-lg font-semibold text-fail mb-2">Danger Zone</h2>
            <p className="text-sm text-muted mb-4">
              Permanently delete your account, including your attempt history, feedback, and Live
              Tasting sessions. This cannot be undone.
            </p>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmText("");
                setDeleteAccountError(null);
                setShowDeleteModal(true);
              }}
              className="px-6 py-2.5 bg-fail hover:bg-fail/85 text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer"
            >
              Delete account
            </button>
          </section>
        </div>
      </main>

      {/* Delete-account confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => { if (!accountDeleting) setShowDeleteModal(false); }}
          />
          <div className="relative w-full max-w-md bg-card rounded-xl border border-fail/30 shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-fail mb-2">Delete your account?</h3>
            <p className="text-sm text-muted mb-4">
              This permanently deletes your account and everything attached to it — attempt
              history, feedback, saved keys, and Live Tasting sessions. There is no undo.
            </p>
            {deleteAccountError && (
              <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-fail">{deleteAccountError}</p>
              </div>
            )}
            <label htmlFor="deleteConfirm" className="block text-sm font-medium text-foreground mb-1.5">
              Type <span className="font-semibold text-fail">{DELETE_CONFIRMATION_PHRASE}</span> to confirm
            </label>
            <input
              id="deleteConfirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRMATION_PHRASE}
              autoComplete="off"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-fail focus:ring-1 focus:ring-fail transition-colors text-sm mb-6"
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={accountDeleting}
                className="px-6 py-2.5 rounded-lg border border-border text-muted hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={accountDeleting || deleteConfirmText !== DELETE_CONFIRMATION_PHRASE}
                className="px-6 py-2.5 rounded-lg bg-fail hover:bg-fail/85 text-background font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {accountDeleting ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
