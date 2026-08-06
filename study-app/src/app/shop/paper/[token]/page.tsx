import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLiveTastingPaperByTokenHash, getPaperSessions, stampPaperTokenFirstUsed } from "@/lib/db";
import { hashShareToken, looksLikeShareToken } from "@/lib/share-token";
import { paperComposition } from "@/lib/live-tasting-paper-engine";
import { BriefCard } from "@/app/components/BriefCard";
import { PaperPartnerEntry } from "./PaperPartnerEntry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wine shopping brief — full paper",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * /shop/paper/[token] — the no-auth PARTNER page for a BYO full paper: the multi-flight brief
 * plus one wine-entry form per remaining flight. Same hardening as the session share page
 * (hashed token, expiry, noindex, no-referrer); first open stamps token_first_used_at.
 */
export default async function PaperShopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!looksLikeShareToken(token)) notFound();

  const paper = await getLiveTastingPaperByTokenHash(hashShareToken(token));
  if (!paper || paper.mode !== "byo" || !paper.prep_guidance) notFound();

  await stampPaperTokenFirstUsed(paper.id);

  const comp = paperComposition(paper);
  const children = await getPaperSessions(paper.id);
  const entered = new Set(children.map((c) => c.paper_position));
  const remaining = comp.filter((c) => !entered.has(c.position));
  const totalWines = comp.reduce((s, c) => s + c.flightSize, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Wine shopping brief — {comp.length} flights, {totalWines} bottles
        </h1>
        <p className="text-sm text-muted mt-2 mb-6">
          You&apos;re buying a full practice paper for someone&apos;s blind tasting —
          <strong className="text-foreground"> don&apos;t tell them anything you buy.</strong>{" "}
          Work flight by flight: buy the bottles matching each section of the brief, then enter
          exactly what you bought below. Their questions are built around your bottles.
        </p>

        <div className="mb-6">
          <BriefCard title="The brief — all flights" markdown={paper.prep_guidance} />
        </div>

        {remaining.length === 0 ? (
          <section className="bg-success/10 border border-success/30 rounded-xl p-5">
            <p className="text-sm font-medium text-foreground mb-2">Every flight is in — the paper is ready.</p>
            <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
              <li>Bag every bottle opaquely; label bags by flight and number (e.g. &quot;Q2 · #1&quot;).</li>
              <li>Pour each flight in order when they sit it.</li>
              <li>Reveal nothing until the whole paper is graded.</li>
            </ol>
          </section>
        ) : (
          <div className="space-y-6">
            {remaining.map((c) => (
              <section key={c.position} className="bg-card rounded-xl border border-border p-5">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  Flight {c.position} — enter {c.flightSize} bottles
                </h2>
                <p className="text-xs text-muted mb-4">
                  Match the &quot;Flight {c.position}&quot; section of the brief above.
                </p>
                <PaperPartnerEntry token={token} position={c.position} count={c.flightSize} />
              </section>
            ))}
          </div>
        )}

        <p className="text-xs text-muted mt-8">This link stops working once the paper is done.</p>
      </div>
    </div>
  );
}
