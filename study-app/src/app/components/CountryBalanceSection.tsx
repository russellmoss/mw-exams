"use client";

// CountryBalanceSection — the "Country Balance" card on /admin/bank-health.
//
// A passive, always-on read of how the live question bank's country mix compares with the historical
// shape of the exam (lib/countryTargets.ts). No controls, no toggles, no refresh — it simply shows,
// per country, the bank's share as an amber-muted bar with a thin amber tick at the historical
// target, the "bank% · target N%" figures, and a verdict-coloured status pill (On track / Light /
// Heavy). A muted footer names the origins the next batches will lean toward — or notes the bank is
// close to the mix. Cellar look: a flat bordered card on warm-stone, a Fraunces serif title, Geist
// body.

type BalanceStatus = "on_track" | "light" | "heavy";
type OverallStatus = "ok" | "insufficient";

interface CountryRow {
  country: string;
  bankPct: number;
  targetPct: number;
  count: number;
  status: BalanceStatus;
}

export interface CountryBalance {
  sample: number;
  status: OverallStatus;
  rows: CountryRow[];
  lean: string[];
}

// Status → user-facing label + verdict colour (subtle bg + border + text, per DESIGN.md).
const STATUS_LABEL: Record<BalanceStatus, string> = {
  on_track: "On track",
  light: "Light",
  heavy: "Heavy",
};
const STATUS_CLASS: Record<BalanceStatus, string> = {
  on_track: "border-success/40 bg-success/10 text-success",
  light: "border-borderline/40 bg-borderline/10 text-borderline",
  heavy: "border-fail/40 bg-fail/10 text-fail",
};

// "Italy, Germany and Portugal".
function joinAnd(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function StatusPill({ status }: { status: BalanceStatus }) {
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CountryBalanceSection({ balance }: { balance: CountryBalance }) {
  // Bar scale: the largest bank-or-target share across the rows, so France's ~34% fills most of the
  // track and the smaller origins still read. Floored at 1 to avoid a divide-by-zero.
  const scale = Math.max(
    1,
    ...balance.rows.map((r) => Math.max(r.bankPct, r.targetPct))
  );

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-display text-lg text-foreground">Country Balance</h2>
      <p className="text-sm text-muted mt-1">How your bank compares to the last 14 MW practicals.</p>

      {balance.status === "insufficient" ? (
        // Insufficient state (spec §5): two centred muted lines, no rows.
        <div className="mt-6 text-center">
          <p className="text-sm text-muted">Not enough questions yet to read the balance</p>
          <p className="text-xs text-muted mt-1">
            Country balance reads once the bank passes 40 questions.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 divide-y divide-border/60">
            {balance.rows.map((row) => (
              <div key={row.country} className="flex items-center gap-3 py-2.5">
                <span className="w-[120px] shrink-0 truncate text-sm text-foreground">{row.country}</span>

                {/* Track: warm-stone 6px rail, amber fill for the bank share + a thin amber tick at
                    the historical target. */}
                <div className="relative h-1.5 flex-1 rounded-full bg-card-hover overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-accent/40"
                    style={{ width: `${Math.min(100, (row.bankPct / scale) * 100)}%` }}
                  />
                  {row.targetPct > 0 && (
                    <div
                      className="absolute inset-y-0 w-0.5 bg-accent"
                      style={{ left: `${Math.min(100, (row.targetPct / scale) * 100)}%` }}
                      aria-hidden
                    />
                  )}
                </div>

                <span className="w-[104px] shrink-0 text-right text-xs text-muted tabular-nums">
                  <span className="text-foreground">{row.bankPct}%</span> · target {row.targetPct}%
                </span>
                <StatusPill status={row.status} />
              </div>
            ))}
          </div>

          {/* Footer (spec §5): name the lean, or say the bank is close to the mix. */}
          <p className="text-xs text-muted mt-4">
            {balance.lean.length > 0
              ? `Next batches will lean toward ${joinAnd(balance.lean)}.`
              : "Your bank is close to the historical mix — no lean applied."}
          </p>
        </>
      )}
    </section>
  );
}
