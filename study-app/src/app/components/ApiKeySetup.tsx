"use client";

// The keys step. Rendered by /onboarding, which is where a Google sign-up lands.
//
// WHY THIS EXISTS SEPARATELY FROM THE SIGNUP FORM. The email/password form can demand keys before it
// will create the account; OAuth cannot — Google hands us a verified identity and the account exists
// before anyone has typed anything. So the requirement has to be enforced after the fact, and this
// is where. Anything that must be true of a new account must be enforced in BOTH places or it is
// enforced in neither.

import { useState } from "react";

interface Provider {
  id: "anthropic" | "tavily" | "elevenlabs";
  label: string;
  placeholder: string;
  required: boolean;
  why: string;
  href: string;
  hrefLabel: string;
  note?: string;
}

const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    label: "Anthropic API Key",
    placeholder: "sk-ant-...",
    required: true,
    why: "Generates and grades every question. Nothing works without it.",
    href: "https://console.anthropic.com/",
    hrefLabel: "Get a key from the Anthropic Console",
  },
  {
    id: "tavily",
    label: "Tavily API Key",
    placeholder: "tvly-...",
    required: true,
    why: "Powers the live wine research behind every answer — tech sheets, critic notes, fact-checking.",
    href: "https://app.tavily.com/",
    hrefLabel: "Get a key from Tavily",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs API Key",
    placeholder: "sk_...",
    required: false,
    why: "Only for talking to the Coach out loud and having answers read to you. Everything else works without it.",
    href: "https://elevenlabs.io/app/developers/api-keys",
    hrefLabel: "Get a key from ElevenLabs",
    note: "Copy the key that starts sk_, not the shorter key ID beside it — the key is shown only once.",
  },
];

export function ApiKeySetup({
  /** Which providers this account already has. Satisfied ones render as done and are not re-asked. */
  have,
  onSaved,
}: {
  have: { anthropic: boolean; tavily: boolean; elevenlabs: boolean };
  onSaved: () => Promise<void> | void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const isDone = (p: Provider) => have[p.id] || saved[p.id];

  const save = async (p: Provider) => {
    const value = (values[p.id] || "").trim();
    if (!value) return;
    setBusy(p.id);
    setErrors((e) => ({ ...e, [p.id]: "" }));
    try {
      const res = await fetch("/api/user/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: value, provider: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors((e) => ({ ...e, [p.id]: data.error || "Couldn't save that key." }));
        return;
      }
      setSaved((s) => ({ ...s, [p.id]: true }));
      setValues((v) => ({ ...v, [p.id]: "" }));
      await onSaved();
    } catch {
      setErrors((e) => ({ ...e, [p.id]: "Network error — try again." }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {PROVIDERS.map((p) => {
        const done = isDone(p);
        return (
          <div
            key={p.id}
            className={`rounded-xl border p-4 space-y-3 ${
              done ? "border-success/40 bg-success/5" : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {p.label}{" "}
                  <span className={`font-normal ${p.required ? "text-accent" : "text-muted"}`}>
                    {p.required ? "(required)" : "(optional — for voice)"}
                  </span>
                </p>
                <p className="text-xs text-muted mt-1 leading-relaxed">{p.why}</p>
              </div>
              {done && (
                <span className="shrink-0 text-xs text-success font-medium" aria-label="Saved">
                  ✓ Saved
                </span>
              )}
            </div>

            {!done && (
              <>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={values[p.id] || ""}
                    onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
                    placeholder={p.placeholder}
                    aria-label={p.label}
                    className="flex-1 min-w-0 px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => save(p)}
                    disabled={busy === p.id || !(values[p.id] || "").trim()}
                    className="shrink-0 px-4 py-2 bg-accent hover:bg-accent-hover text-background text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy === p.id ? "Checking…" : "Save"}
                  </button>
                </div>
                {p.note && <p className="text-xs text-muted leading-relaxed">{p.note}</p>}
                {errors[p.id] && <p className="text-xs text-fail leading-relaxed">{errors[p.id]}</p>}
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {p.hrefLabel}
                </a>
              </>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted leading-relaxed">
        Every key is <strong className="text-foreground">encrypted at rest</strong>, never shared, and
        used only on your behalf. You can change or remove them any time in Settings.
      </p>
    </div>
  );
}
