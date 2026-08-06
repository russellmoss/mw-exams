"use client";

import { useState } from "react";

/**
 * The one thing a partner may WRITE: the vintage they actually bought for a slot (fed to the
 * grader so maturity observations are judged against the real bottle). Token-authenticated,
 * vintage-shaped values only — see /api/shop/[token]/vintage.
 */
export function VintageForm({ token, slot, initial }: { token: string; slot: number; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!/^(19|20)\d{2}$|^NV$/i.test(value.trim())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shop/${token}/vintage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, vintage: value.trim().toUpperCase() }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
      <label htmlFor={`vintage-${slot}`} className="text-xs text-muted shrink-0">
        Vintage bought (optional)
      </label>
      <input
        id={`vintage-${slot}`}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 2021 or NV"
        maxLength={4}
        className="w-24 px-2 py-1.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-xs tabular-nums"
      />
      <button
        onClick={save}
        disabled={busy || !/^(19|20)\d{2}$|^NV$/i.test(value.trim())}
        className="text-xs text-accent hover:text-accent-hover disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
