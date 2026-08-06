"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface UserDetail {
  id: number;
  email: string;
  name: string;
  address: string | null;
  business: string | null;
  job_title: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  avatar_url: string | null;
  has_password: boolean;
  google_linked: boolean;
  live_city: string | null;
  live_state: string | null;
  live_country: string | null;
  live_budget_amount: number | null;
  live_budget_currency: string | null;
  live_radius_minutes: number | null;
  has_own_key: boolean;
  key_hint: string | null;
  attempt_count: number;
  completed_count: number;
}

interface Props {
  userId: number;
  currentUserId: number;
  onClose: () => void;
  /** Called after any change that the user list should reflect (profile, role, status). */
  onChanged: () => void;
}

const inputClass =
  "w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent";
const labelClass = "block text-xs text-muted mb-1";

export function AdminUserModal({ userId, currentUserId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable profile fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [business, setBusiness] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [liveCity, setLiveCity] = useState("");
  const [liveState, setLiveState] = useState("");
  const [liveCountry, setLiveCountry] = useState("");
  const [saving, setSaving] = useState(false);

  // Password + email actions
  const [newPassword, setNewPassword] = useState("");
  const [settingPw, setSettingPw] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const isSelf = userId === currentUserId;
  const busy = saving || settingPw || sendingReset || sendingInvite || toggling;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Failed to load user");
        return;
      }
      const u: UserDetail = data.user;
      setDetail(u);
      setName(u.name || "");
      setEmail(u.email || "");
      setAddress(u.address || "");
      setBusiness(u.business || "");
      setJobTitle(u.job_title || "");
      setLiveCity(u.live_city || "");
      setLiveState(u.live_state || "");
      setLiveCountry(u.live_country || "");
    } catch {
      setLoadError("Network error");
    }
  }, [userId]);

  // Wrapped rather than called directly: `load()` in the effect body reaches setState on the
  // synchronous path, which react-hooks/set-state-in-effect flags. The fetch is async either way.
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    setMsg(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          address,
          business,
          jobTitle,
          liveCity,
          liveState,
          liveCountry,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error || "Failed to save" });
      } else {
        setMsg({ kind: "ok", text: "Profile saved." });
        onChanged();
        load();
      }
    } catch {
      setMsg({ kind: "err", text: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSetPassword = async () => {
    setMsg(null);
    setSettingPw(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error || "Failed to set password" });
      } else {
        setMsg({ kind: "ok", text: "Password updated." });
        setNewPassword("");
        load();
      }
    } catch {
      setMsg({ kind: "err", text: "Network error" });
    } finally {
      setSettingPw(false);
    }
  };

  const handleSendEmail = async (kind: "reset" | "invite") => {
    const label = kind === "reset" ? "password-reset email" : "invitation email";
    if (!window.confirm(`Send a ${label} to ${detail?.email}?`)) return;
    setMsg(null);
    const setBusyFlag = kind === "reset" ? setSendingReset : setSendingInvite;
    setBusyFlag(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/send-${kind}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error || "Failed to send" });
      } else {
        setMsg({
          kind: "ok",
          text: `${kind === "reset" ? "Reset email" : "Invitation"} sent to ${data.sentTo}.`,
        });
      }
    } catch {
      setMsg({ kind: "err", text: "Network error" });
    } finally {
      setBusyFlag(false);
    }
  };

  const handleToggle = async (patch: { isAdmin?: boolean; isActive?: boolean }) => {
    setMsg(null);
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error || "Failed to update" });
      } else {
        onChanged();
        load();
      }
    } catch {
      setMsg({ kind: "err", text: "Network error" });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4 pb-4">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-display text-lg text-foreground truncate">
              {detail ? detail.name : "Loading…"}
            </h2>
            {detail?.is_admin && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-accent/20 text-accent shrink-0">
                Admin
              </span>
            )}
            {detail && !detail.is_active && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-fail/20 text-fail shrink-0">
                Disabled
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors cursor-pointer p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loadError ? (
          <p className="p-6 text-sm text-fail">{loadError}</p>
        ) : !detail ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3 text-muted">
              <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
              <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
              <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-6">
            {msg && (
              <div
                className={`rounded-lg p-3 border ${
                  msg.kind === "ok" ? "bg-success/10 border-success/30" : "bg-fail/10 border-fail/30"
                }`}
              >
                <p className={`text-sm ${msg.kind === "ok" ? "text-success" : "text-fail"}`}>{msg.text}</p>
              </div>
            )}

            {/* Account facts (read-only) */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              <span>Joined {new Date(detail.created_at).toLocaleDateString()}</span>
              <span className="tabular-nums">
                {detail.completed_count}/{detail.attempt_count} attempts completed
              </span>
              <span>{detail.has_own_key ? `API key ${detail.key_hint}` : detail.is_admin ? "Server key" : "No API key"}</span>
              <span>
                Sign-in: {[detail.has_password ? "password" : null, detail.google_linked ? "Google" : null]
                  .filter(Boolean)
                  .join(" + ") || "none set"}
              </span>
              <Link
                href={`/admin/users/${detail.id}`}
                className="text-accent hover:text-accent-hover transition-colors"
              >
                View history →
              </Link>
            </div>

            {/* Profile */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-3">Profile</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Full name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Address</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Business</label>
                  <input type="text" value={business} onChange={(e) => setBusiness(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Job title</label>
                  <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            {/* Live Tasting location */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-1">Live Tasting location</h3>
              <p className="text-xs text-muted mb-3">
                The market Live Tasting shops from when building this user&rsquo;s flights.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>City / town</label>
                  <input type="text" value={liveCity} onChange={(e) => setLiveCity(e.target.value)}
                    placeholder="e.g. New Hope" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>State / region (optional)</label>
                  <input type="text" value={liveState} onChange={(e) => setLiveState(e.target.value)}
                    placeholder="e.g. Pennsylvania" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Country</label>
                  <input type="text" value={liveCountry} onChange={(e) => setLiveCountry(e.target.value)}
                    placeholder="e.g. United States" className={inputClass} />
                </div>
              </div>
              {(detail.live_budget_amount != null || detail.live_radius_minutes != null) && (
                <p className="text-xs text-muted mt-2">
                  {detail.live_budget_amount != null &&
                    `Budget: ${detail.live_budget_amount} ${detail.live_budget_currency ?? ""}`}
                  {detail.live_budget_amount != null && detail.live_radius_minutes != null && " · "}
                  {detail.live_radius_minutes != null && `Drive radius: ~${detail.live_radius_minutes} min`}
                  {" (user-set in their Settings)"}
                </p>
              )}
            </section>

            {/* Save */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={busy || !name.trim() || !email.trim()}
                className="px-5 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving && (
                  <span className="w-3.5 h-3.5 border-2 border-background/40 border-t-background rounded-full animate-spin" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            {/* Password */}
            <section className="border-t border-border pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-1">Password</h3>
              <p className="text-xs text-muted mb-3">
                {detail.has_password
                  ? "Set a new password directly, or email the user a reset link."
                  : "This account has no password yet (Google sign-in or invited). Set one directly, or send an email so they choose their own."}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  minLength={6}
                  className={`${inputClass} sm:flex-1`}
                />
                <button
                  onClick={handleSetPassword}
                  disabled={busy || newPassword.length < 6}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-foreground hover:border-accent transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {settingPw ? "Setting…" : "Set password"}
                </button>
              </div>
            </section>

            {/* Email actions */}
            <section className="border-t border-border pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Email the user</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleSendEmail("reset")}
                  disabled={busy || !detail.is_active}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-foreground hover:border-accent transition-colors cursor-pointer disabled:opacity-50"
                >
                  {sendingReset ? "Sending…" : "Send password-reset email"}
                </button>
                <button
                  onClick={() => handleSendEmail("invite")}
                  disabled={busy || !detail.is_active}
                  className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-foreground hover:border-accent transition-colors cursor-pointer disabled:opacity-50"
                >
                  {sendingInvite ? "Sending…" : "Send invitation email"}
                </button>
              </div>
              <p className="text-xs text-muted mt-2">
                Reset link expires in 1 hour; invitation link (set-your-password welcome) lasts 7 days.
                {!detail.is_active && " Enable the account to send email."}
              </p>
            </section>

            {/* Role & status */}
            {!isSelf && (
              <section className="border-t border-border pt-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Role &amp; status</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleToggle({ isAdmin: !detail.is_admin })}
                    disabled={busy}
                    className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-foreground hover:border-accent transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {detail.is_admin ? "Demote to user" : "Make admin"}
                  </button>
                  <button
                    onClick={() => handleToggle({ isActive: !detail.is_active })}
                    disabled={busy}
                    className={`px-4 py-2 text-sm rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                      detail.is_active
                        ? "border-border text-muted hover:text-fail hover:border-fail"
                        : "border-border text-muted hover:text-success hover:border-success"
                    }`}
                  >
                    {detail.is_active ? "Disable account" : "Enable account"}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
