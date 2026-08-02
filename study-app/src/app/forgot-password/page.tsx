"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Deliberately ignored. The endpoint always succeeds from the caller's point of view, and
      // showing a network error here would hint at whether the address exists.
    }
    // Always show the same confirmation, matching the endpoint's enumeration-safe behaviour.
    setSent(true);
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen px-6 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Bhutan Wine Company" width={80} height={80} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Reset your password</h1>
          <p className="text-sm text-muted mt-1">
            {sent ? "Check your inbox" : "We'll email you a link to choose a new one"}
          </p>
        </div>

        {sent ? (
          <div className="bg-card rounded-xl border border-border p-6">
            <p className="text-sm text-foreground leading-relaxed">
              If an account exists for <span className="text-accent">{email}</span>, a reset link is
              on its way. It expires in 60 minutes and can only be used once.
            </p>
            <p className="text-sm text-muted leading-relaxed mt-3">
              Nothing arrived? Check your spam folder, or{" "}
              <button
                onClick={() => setSent(false)}
                className="text-accent hover:text-accent-hover transition-colors cursor-pointer"
              >
                try a different email
              </button>
              .
            </p>
            <Link
              href="/login"
              className="mt-5 block w-full text-center py-2.5 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg transition-colors text-sm font-medium"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fp-email" className="block text-sm font-medium text-foreground mb-1.5">
                Email
              </label>
              <input
                id="fp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>
            <Link
              href="/login"
              className="block w-full text-center py-2.5 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg transition-colors text-sm font-medium"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
