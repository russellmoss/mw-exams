"use client";

// Post-signup onboarding, in two steps: the API keys, then two defaults about how the app spends
// the user's own credits.
//
// THE KEYS STEP IS THE ONLY PLACE A GOOGLE SIGN-UP CAN BE ASKED FOR THEM. The email/password form
// refuses to create an account without Anthropic and Tavily; OAuth cannot do that, because Google
// hands us a verified identity and the account exists before the user has typed anything. So this
// screen carries the same requirement, and there is deliberately no way past it — the "Skip for
// now" escape applies to the defaults, which are preferences, not to the keys, which are the two
// things without which the app does nothing.
//
// Admins pass straight through: they resolve to the server keys (BYOK-unless-admin).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiKeySetup } from "@/app/components/ApiKeySetup";
import { PersonaPicker } from "@/app/components/PersonaPicker";
import { DEFAULT_PERSONA, type PersonaId } from "@/lib/personas";

type QuestionSource = "banked" | "fresh";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [questionSource, setQuestionSource] = useState<QuestionSource>("banked");
  const [reasoningStream, setReasoningStream] = useState(false);
  const [persona, setPersona] = useState<PersonaId>(DEFAULT_PERSONA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"keys" | "defaults">("keys");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/user/study-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionSource, reasoningStream }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save your defaults");
      }
      // Separate route, and a failure here must NOT block onboarding: the column already defaults
      // to 'mentor', so a dropped persona save leaves them on the voice this screen pre-selected
      // anyway. The two credit choices are the ones worth surfacing an error for.
      if (persona !== DEFAULT_PERSONA) {
        await fetch("/api/user/persona", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona }),
        }).catch(() => {});
      }
      await refresh();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your defaults");
      setSaving(false);
    }
  };

  if (loading || !user) {
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

  const hasRequiredKeys = user.hasApiKey && user.hasTavilyKey !== false;

  // Step one, until the two required keys exist. Shown even to a user who arrives here with them
  // already saved only if they are missing — otherwise we skip straight to the defaults.
  if (step === "keys" && !hasRequiredKeys) {
    return (
      <div className="flex flex-col flex-1 items-center min-h-screen px-6 py-12">
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Welcome, {user.name?.split(" ")[0] || "candidate"}
          </h1>
          <p className="text-sm text-muted mt-2 mb-8 leading-relaxed">
            This app runs on your own API keys, so your usage is yours — nothing is shared or
            resold. Two are needed before you can start; the third is only for voice.
          </p>

          <ApiKeySetup
            have={{
              anthropic: !!user.hasApiKey,
              tavily: user.hasTavilyKey !== false,
              elevenlabs: !!user.hasVoiceKey,
              grok: !!user.hasGrokKey,
            }}
            onSaved={refresh}
          />

          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setStep("defaults")}
              disabled={!hasRequiredKeys}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
            {!hasRequiredKeys && (
              <p className="text-xs text-muted">
                Add the Anthropic and Tavily keys to continue.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center min-h-screen px-6 py-12">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Welcome, {user.name?.split(" ")[0] || "candidate"}
        </h1>
        <p className="text-sm text-muted mt-2 mb-8 leading-relaxed">
          Two quick choices about how the app spends your API credits, and one about how it talks
          to you. We&apos;ve pre-selected sensible options — you can change any of them later in
          Settings.
        </p>

        {error && (
          <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-6">
            <p className="text-sm text-fail">{error}</p>
          </div>
        )}

        {/* Question source */}
        <section className="bg-card rounded-xl border border-border p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">Where should your questions come from?</h2>
          <p className="text-sm text-muted mb-5">
            Both options stay one click away on every question — this sets which one the app leads with.
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setQuestionSource("banked")}
              className={`w-full text-left rounded-lg border px-4 py-4 transition-colors cursor-pointer ${
                questionSource === "banked" ? "border-accent bg-accent/10" : "border-border hover:border-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${questionSource === "banked" ? "border-accent" : "border-muted"}`}>
                  {questionSource === "banked" && <span className="w-2 h-2 rounded-full bg-accent" />}
                </span>
                <span className={`text-sm font-medium ${questionSource === "banked" ? "text-accent" : "text-foreground"}`}>
                  Banked questions
                </span>
                <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-success bg-success/10 border border-success/30 rounded-full px-2 py-0.5">
                  Recommended · free
                </span>
              </div>
              <p className="text-sm text-muted mt-2 pl-6 leading-relaxed">
                Served instantly from the reviewed question bank — always a question you&apos;ve never
                seen, written by the same examiner engine. No model call, so it costs{" "}
                <strong className="text-foreground">nothing on your API key</strong>.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setQuestionSource("fresh")}
              className={`w-full text-left rounded-lg border px-4 py-4 transition-colors cursor-pointer ${
                questionSource === "fresh" ? "border-accent bg-accent/10" : "border-border hover:border-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${questionSource === "fresh" ? "border-accent" : "border-muted"}`}>
                  {questionSource === "fresh" && <span className="w-2 h-2 rounded-full bg-accent" />}
                </span>
                <span className={`text-sm font-medium ${questionSource === "fresh" ? "text-accent" : "text-foreground"}`}>
                  Freshly generated
                </span>
              </div>
              <p className="text-sm text-muted mt-2 pl-6 leading-relaxed">
                A brand-new question written for you on the spot. Same engine, same standard — the
                draw is novelty and volume: the bank is finite, and a fresh generation never runs
                out. Each one is a real model call on your key (typically tens of cents) and takes
                30&ndash;60 seconds.
              </p>
            </button>
          </div>
        </section>

        {/* Reasoning stream */}
        <section className="bg-card rounded-xl border border-border p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-1">Stream the examiner&apos;s reasoning?</h2>
          <p className="text-sm text-muted mb-5">
            While the app generates a question or grades your answer, it can stream the model&apos;s
            live reasoning to your screen.
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setReasoningStream(false)}
              className={`w-full text-left rounded-lg border px-4 py-4 transition-colors cursor-pointer ${
                !reasoningStream ? "border-accent bg-accent/10" : "border-border hover:border-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${!reasoningStream ? "border-accent" : "border-muted"}`}>
                  {!reasoningStream && <span className="w-2 h-2 rounded-full bg-accent" />}
                </span>
                <span className={`text-sm font-medium ${!reasoningStream ? "text-accent" : "text-foreground"}`}>
                  Off &mdash; save your credits
                </span>
                <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-success bg-success/10 border border-success/30 rounded-full px-2 py-0.5">
                  Recommended
                </span>
              </div>
              <p className="text-sm text-muted mt-2 pl-6 leading-relaxed">
                You still get live progress updates while the app works — those are free. Turning the
                reasoning display off means the extra thinking tokens are{" "}
                <strong className="text-foreground">never billed to your key</strong> on generation
                and grading calls.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setReasoningStream(true)}
              className={`w-full text-left rounded-lg border px-4 py-4 transition-colors cursor-pointer ${
                reasoningStream ? "border-accent bg-accent/10" : "border-border hover:border-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${reasoningStream ? "border-accent" : "border-muted"}`}>
                  {reasoningStream && <span className="w-2 h-2 rounded-full bg-accent" />}
                </span>
                <span className={`text-sm font-medium ${reasoningStream ? "text-accent" : "text-foreground"}`}>
                  On &mdash; watch the examiner think
                </span>
              </div>
              <p className="text-sm text-muted mt-2 pl-6 leading-relaxed">
                Genuinely worth knowing about: the stream shows the model reasoning through your
                question the way a real examiner would &mdash; which regions a stem narrows to, what a
                flight is testing, why one wine earns the marks. Watching that thought process is a
                study tool in its own right. The trade-off is honest: those thinking tokens bill to
                your API key on every generation and grading call.
              </p>
            </button>
          </div>
        </section>

        {/* Voice */}
        <section className="bg-card rounded-xl border border-border p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-1">How should it talk to you?</h2>
          <p className="text-sm text-muted mb-5">
            The Coach, your graded debriefs, and the rulings on any feedback you file.{" "}
            <strong className="text-foreground">Your voice cannot change your marks</strong> — the
            grading happens first, in one neutral voice, and only the wording is changed afterwards.
            Switch any time in Settings, or just tell the Coach to change it.
          </p>
          <PersonaPicker
            value={persona}
            onChange={setPersona}
            disabled={saving}
            unavailable={
              user?.hasGrokKey
                ? undefined
                : { unhinged: "Needs an xAI (Grok) key — add one above, or in Settings." }
            }
          />
        </section>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save & start studying"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            disabled={saving}
            className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
