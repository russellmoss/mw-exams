"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  // A missing token is knowable during render, so derive it here rather than setting state in an
  // effect (which would cause a cascading re-render).
  const [checking, setChecking] = useState(Boolean(token));
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(
    token ? null : "This reset link is missing its token. Please request a new one."
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Validate before rendering the form, so an expired link says so instead of failing on submit
  // after the user has already chosen a password.
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.valid) {
          setTokenValid(true);
          setTokenEmail(data.email ?? null);
        } else {
          setTokenError(
            data.reason === "expired"
              ? "This reset link has expired. Please request a new one."
              : data.reason === "used"
                ? "This reset link has already been used. Please request a new one."
                : "This reset link is not valid. Please request a new one."
          );
        }
      } catch {
        setTokenError("Could not check this link. Please try again.");
      }
      setChecking(false);
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not reset your password");
        setSubmitting(false);
        return;
      }
      // The endpoint signs us in, so go straight to the app. Full reload so the auth context
      // picks up the new session cookie.
      window.location.href = "/";
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center gap-1.5 py-8">
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <p className="text-sm text-fail leading-relaxed">{tokenError}</p>
        <Link
          href="/forgot-password"
          className="mt-5 block w-full text-center py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors"
        >
          Request a new link
        </Link>
        <Link
          href="/login"
          className="mt-3 block w-full text-center py-2.5 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg transition-colors text-sm font-medium"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {tokenEmail && (
        <p className="text-sm text-muted text-center">
          Setting a new password for <span className="text-accent">{tokenEmail}</span>
        </p>
      )}

      {error && (
        <div className="bg-fail/10 border border-fail/30 rounded-lg p-3">
          <p className="text-sm text-fail">{error}</p>
        </div>
      )}

      <div>
        <label htmlFor="rp-password" className="block text-sm font-medium text-foreground mb-1.5">
          New password
        </label>
        <div className="relative">
          <input
            id="rp-password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            autoFocus
            className="w-full px-3 py-2.5 pr-10 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            placeholder="At least 6 characters"
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors cursor-pointer"
            tabIndex={-1}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? (
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
            ) : (
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            )}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="rp-confirm" className="block text-sm font-medium text-foreground mb-1.5">
          Confirm new password
        </label>
        <input
          id="rp-confirm"
          type={showPw ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          placeholder="Repeat your new password"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen px-6 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Bhutan Wine Company" width={80} height={80} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Choose a new password</h1>
        </div>
        {/* useSearchParams needs a Suspense boundary to avoid opting the whole route into CSR. */}
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
