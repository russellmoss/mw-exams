"use client";

import { useState } from "react";
import { ByoWineForm } from "@/app/components/ByoWineForm";

/**
 * Partner-side wine entry on the no-auth share page (BYO mode). After the question is built,
 * the partner gets the bagging instructions — the candidate's session flips to ready on its own.
 */
export function PartnerWineEntry({ token, defaultCount }: { token: string; defaultCount: number }) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="bg-success/10 border border-success/30 rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-2">All set — the question is ready.</p>
        <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
          <li>Put each bottle in an opaque bag (foil or a sock works).</li>
          <li>Number the bags in the order you entered the wines.</li>
          <li>Don&apos;t reveal anything until they&apos;ve submitted their answer.</li>
        </ol>
      </div>
    );
  }

  return (
    <ByoWineForm
      endpoint={`/api/shop/${token}/wines`}
      defaultCount={defaultCount}
      onDone={() => setDone(true)}
    />
  );
}
