"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

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

  useEffect(() => {
    if (user) {
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
          <p className="text-sm text-muted mt-1">Manage your account and API key</p>
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
        </div>
      </main>
    </div>
  );
}
