import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLiveTastingSessionByTokenHash, stampLiveTastingEvent } from "@/lib/db";
import { hashShareToken, looksLikeShareToken } from "@/lib/share-token";
import type { Stockist } from "@/lib/live-tasting";
import { VintageForm } from "./VintageForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hardened per live_tasting_plan.md §2.5: never indexed, never cached, never leaks a referrer.
// (Dynamic rendering already sends no-store cache headers.)
export const metadata: Metadata = {
  title: "Wine shopping list",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type SlotAvail = {
  slot: number; label: string; region: string; country: string;
  stockists: Stockist[]; thin: boolean; overBudget?: boolean;
};

const KIND_LABEL: Record<string, string> = {
  local: "Local shop",
  state_store: "State store",
  mail: "Ships to you",
};

/**
 * /shop/[token] — the no-auth partner shopping list.
 *
 * Shows ONLY what a buyer needs: the wines, stockist leads, budget, and bagging instructions —
 * never the question, the answer key, or who the candidate is. First load stamps
 * token_first_used_at (set-once), which is what earns the session its 'partner' blind badge.
 * 404s once the session is graded, abandoned, or the link expired/rotated.
 */
export default async function ShopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!looksLikeShareToken(token)) notFound();

  const session = await getLiveTastingSessionByTokenHash(hashShareToken(token));
  if (!session) notFound();

  await stampLiveTastingEvent(session.id, "token_first_used_at");

  const avail = (session.availability ?? {}) as { archetypeLabel?: string; slots?: SlotAvail[] };
  const slots = Array.isArray(avail.slots) ? avail.slots : [];
  const vintages = (session.vintages_bought ?? {}) as Record<string, string>;
  const budget =
    session.budget_amount != null
      ? `${session.budget_amount} ${session.budget_currency ?? ""} per bottle`
      : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Wine shopping list</h1>
        <p className="text-sm text-muted mt-2 mb-8">
          You&apos;re buying {slots.length} wines for someone&apos;s blind tasting practice —
          <strong className="text-foreground"> don&apos;t tell them what the wines are.</strong>
          {budget ? ` Budget: about ${budget}.` : ""} Stockists below are leads, not guaranteed
          stock — call ahead or check the site. Any similar recent vintage is fine.
        </p>

        <div className="space-y-6">
          {slots.map((slot) => (
            <section key={slot.slot} className="bg-card rounded-xl border border-border p-5">
              <p className="text-sm font-medium text-foreground mb-1">
                <span className="text-muted tabular-nums mr-2">#{slot.slot}</span>
                {slot.label}
              </p>
              <p className="text-xs text-muted mb-3">
                {slot.region}, {slot.country}
                {slot.thin ? " · local availability is thin — mail order may be your best bet" : ""}
                {slot.overBudget ? " · listed prices run slightly over the stated budget" : ""}
              </p>
              <div className="space-y-2">
                {slot.stockists.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-background rounded-lg border border-border p-3 hover:border-muted transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{s.name}</p>
                        <p className="text-xs text-muted mt-0.5">{KIND_LABEL[s.kind] ?? s.kind}</p>
                      </div>
                      {s.price != null && (
                        <span className="shrink-0 text-sm text-foreground tabular-nums">
                          {s.price} {s.currency ?? ""}
                        </span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
              <VintageForm token={token} slot={slot.slot} initial={vintages[String(slot.slot)] ?? ""} />
            </section>
          ))}
        </div>

        <section className="bg-card rounded-xl border border-accent/30 p-5 mt-8">
          <h2 className="text-sm font-semibold text-foreground mb-2">Before you hand them over</h2>
          <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
            <li>Put each bottle in an opaque bag (foil or a sock works).</li>
            <li>Number the bags 1–{slots.length} matching the numbers above.</li>
            <li>Optional: record the vintage you bought next to each wine — it makes the grading fairer.</li>
            <li>Don&apos;t reveal anything until they&apos;ve submitted their answer.</li>
          </ol>
        </section>

        <p className="text-xs text-muted mt-8">
          This link stops working once the tasting is graded.
        </p>
      </div>
    </div>
  );
}
