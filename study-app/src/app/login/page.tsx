"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regBusiness, setRegBusiness] = useState("");
  const [regJobTitle, setRegJobTitle] = useState("");
  const [regApiKey, setRegApiKey] = useState("");
  const [showApiHelp, setShowApiHelp] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [showApiKeyField, setShowApiKeyField] = useState(false);

  useEffect(() => {
    if (!loading && user) router.push("/");
  }, [user, loading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); setSubmitting(false); return; }
      window.location.href = "/";
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          address: regAddress,
          business: regBusiness || undefined,
          jobTitle: regJobTitle || undefined,
          apiKey: regApiKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); setSubmitting(false); return; }
      window.location.href = "/";
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen">
        <div className="flex items-center gap-3 text-muted">
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
        </div>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen px-6 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Bhutan Wine Company" width={80} height={80} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            MW Practical Exam
          </h1>
          <p className="text-sm text-muted mt-1">
            {mode === "login" ? "Sign in to your study account" : "Create your study account"}
          </p>
        </div>

        <div className="flex mb-6 bg-card rounded-lg border border-border p-1">
          <button
            onClick={() => { setMode("login"); setError(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              mode === "login" ? "bg-accent text-background" : "text-muted hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("register"); setError(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              mode === "register" ? "bg-accent text-background" : "text-muted hover:text-foreground"
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
            <p className="text-sm text-fail">{error}</p>
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input id="login-password" type={showLoginPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                  placeholder="Enter your password" />
                <button type="button" onClick={() => setShowLoginPw(!showLoginPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors cursor-pointer" tabIndex={-1}>
                  {showLoginPw ? (
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" disabled={submitting}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-sm font-medium text-foreground mb-1.5">
                Full name <span className="text-fail">*</span>
              </label>
              <input id="reg-name" type="text" value={regName} onChange={(e) => setRegName(e.target.value)} required autoFocus
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                placeholder="Jane Smith" />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-foreground mb-1.5">
                Email <span className="text-fail">*</span>
              </label>
              <input id="reg-email" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required autoComplete="email"
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                placeholder="you@example.com" />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-foreground mb-1.5">
                Password <span className="text-fail">*</span>
              </label>
              <div className="relative">
                <input id="reg-password" type={showRegPw ? "text" : "password"} value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required minLength={6} autoComplete="new-password"
                  className="w-full px-3 py-2.5 pr-10 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                  placeholder="At least 6 characters" />
                <button type="button" onClick={() => setShowRegPw(!showRegPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors cursor-pointer" tabIndex={-1}>
                  {showRegPw ? (
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reg-address" className="block text-sm font-medium text-foreground mb-1.5">
                Address <span className="text-fail">*</span>
              </label>
              <input id="reg-address" type="text" value={regAddress} onChange={(e) => setRegAddress(e.target.value)} required
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                placeholder="City, Country" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-business" className="block text-sm font-medium text-foreground mb-1.5">Business</label>
                <input id="reg-business" type="text" value={regBusiness} onChange={(e) => setRegBusiness(e.target.value)}
                  className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                  placeholder="Optional" />
              </div>
              <div>
                <label htmlFor="reg-job-title" className="block text-sm font-medium text-foreground mb-1.5">Job title</label>
                <input id="reg-job-title" type="text" value={regJobTitle} onChange={(e) => setRegJobTitle(e.target.value)}
                  className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                  placeholder="Optional" />
              </div>
            </div>

            <div className="border border-border rounded-lg p-4 bg-card/50 space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="reg-api-key" className="block text-sm font-medium text-foreground">
                  Anthropic API Key
                  <span className="text-muted font-normal ml-1">(optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowApiHelp(true)}
                  className="text-xs text-accent hover:text-accent-hover underline underline-offset-2 cursor-pointer transition-colors"
                >
                  How do I get a key?
                </button>
              </div>
              <div className="relative">
                <input id="reg-api-key" type={showApiKeyField ? "text" : "password"} value={regApiKey} onChange={(e) => setRegApiKey(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors font-mono text-sm"
                  placeholder="sk-ant-..." />
                <button type="button" onClick={() => setShowApiKeyField(!showApiKeyField)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors cursor-pointer" tabIndex={-1}>
                  {showApiKeyField ? (
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-muted leading-relaxed">
                  This app uses your own Anthropic API key to power AI features.
                  Your key is <strong className="text-foreground">encrypted at rest</strong> and never shared.
                  You can skip this and add it later in Settings.
                </p>
              </div>
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Go to Anthropic Console to create a key
              </a>
            </div>

            <button type="submit" disabled={submitting}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}
      </div>

      {showApiHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowApiHelp(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Getting Your Anthropic API Key</h2>
              <button
                type="button"
                onClick={() => setShowApiHelp(false)}
                className="text-muted hover:text-foreground transition-colors cursor-pointer p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 text-sm text-muted leading-relaxed">
              <div className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-background flex items-center justify-center text-xs font-bold">1</span>
                <div>
                  <p className="text-foreground font-medium">Create an Anthropic account</p>
                  <p>
                    Go to{" "}
                    <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline underline-offset-2">
                      console.anthropic.com
                    </a>{" "}
                    and sign up with your email or Google account. If you already have an account, just sign in.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-background flex items-center justify-center text-xs font-bold">2</span>
                <div>
                  <p className="text-foreground font-medium">Add billing</p>
                  <p>
                    Go to <strong className="text-foreground">Settings &rarr; Billing</strong> in the console and add a credit card.
                    The API is pay-as-you-go &mdash; you only pay for what you use, no subscription or minimum charge.
                  </p>
                  <p className="mt-1.5">
                    New accounts may receive a small amount of starter credits for testing, but you&apos;ll need a payment method on file for ongoing use.
                    You can set a monthly spending limit to control costs.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-background flex items-center justify-center text-xs font-bold">3</span>
                <div>
                  <p className="text-foreground font-medium">Create an API key</p>
                  <p>
                    Go to <strong className="text-foreground">Settings &rarr; API Keys</strong> and click <strong className="text-foreground">&ldquo;Create Key&rdquo;</strong>.
                    Give it a name (e.g. &ldquo;MW Study App&rdquo;), then copy the key immediately &mdash; Anthropic only shows it once.
                  </p>
                  <p className="mt-1.5">
                    The key starts with <code className="bg-background px-1.5 py-0.5 rounded text-xs font-mono text-foreground">sk-ant-...</code>
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-background flex items-center justify-center text-xs font-bold">4</span>
                <div>
                  <p className="text-foreground font-medium">Paste it here</p>
                  <p>
                    Paste your key into the field on the registration form. It&apos;s encrypted before storage and only used to make API calls on your behalf.
                  </p>
                </div>
              </div>

              <div className="bg-background border border-border rounded-lg p-3 mt-2">
                <p className="text-xs">
                  <strong className="text-foreground">Typical cost:</strong> This app uses Claude Sonnet for most features.
                  A typical study session (generating questions, evaluating answers, getting feedback) costs roughly $0.05&ndash;$0.30 depending on length.
                  You can monitor usage at{" "}
                  <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline underline-offset-2">
                    console.anthropic.com
                  </a>.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 text-center text-sm"
              >
                Open Anthropic Console
              </a>
              <button
                type="button"
                onClick={() => setShowApiHelp(false)}
                className="flex-1 py-2.5 bg-card border border-border hover:bg-background text-foreground font-medium rounded-lg transition-colors duration-200 cursor-pointer text-sm"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
