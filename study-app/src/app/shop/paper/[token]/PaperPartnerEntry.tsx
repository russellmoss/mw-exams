"use client";

import { useState } from "react";
import { ByoWineForm } from "@/app/components/ByoWineForm";

/** One flight's partner entry on the no-auth paper page; the page reloads to advance flights. */
export function PaperPartnerEntry({ token, position, count }: { token: string; position: number; count: number }) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="bg-success/10 border border-success/30 rounded-lg p-3">
        <p className="text-sm text-foreground">Flight {position} entered — reloading…</p>
      </div>
    );
  }

  return (
    <ByoWineForm
      endpoint={`/api/shop/paper/${token}/wines?position=${position}`}
      defaultCount={count}
      extraBody={{ position }}
      onDone={() => {
        setDone(true);
        setTimeout(() => window.location.reload(), 800);
      }}
    />
  );
}
