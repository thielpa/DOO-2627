import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** Below this, the remaining time of a turn is shown as urgent. */
export const URGENT_MS = HOUR_MS;

/** Rough remaining time, e.g. "23 h left"; precise enough for turn deadlines of hours. */
export function formatTimeLeft(remainingMs: number): string {
  if (remainingMs <= 0) return "time is up";
  if (remainingMs < HOUR_MS) return `${Math.ceil(remainingMs / MINUTE_MS)} min left`;
  if (remainingMs < 48 * HOUR_MS) return `${Math.floor(remainingMs / HOUR_MS)} h left`;
  return `${Math.floor(remainingMs / (24 * HOUR_MS))} days left`;
}

/** Milliseconds until `deadline`, updated every 30 seconds; null without a deadline. */
export function useTimeLeft(deadline: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(intervalId);
  }, []);
  return deadline === null ? null : new Date(deadline).getTime() - now;
}
