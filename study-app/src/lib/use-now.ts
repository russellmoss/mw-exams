"use client";

import { useEffect, useState } from "react";

/**
 * A timestamp for relative-time display ("3m ago", "elapsed 12 min"), held in state and refreshed on
 * an interval.
 *
 * Calling `Date.now()` straight from a component body is an impure read during render — the same
 * component with the same props renders differently on every pass, which is what
 * react-hooks/purity flags. It is also why relative times used to be frozen at whatever the last
 * unrelated re-render happened to be: nothing re-rendered them as time passed.
 *
 * Holding "now" in state fixes both. The interval is the only thing that advances it, so render
 * stays pure, and the displayed time actually ticks.
 *
 * @param intervalMs how often to advance. Default 60s, which matches minute-granularity displays;
 *                   pass something smaller only if the text shows seconds.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
