/** Duration formatting. Every number the user sees passes through here. */

export const SECOND = 1;
export const MINUTE = 60;
export const HOUR = 3600;

/** Seconds elapsed between two instants, floored at 0. */
export function elapsedSeconds(startedAt: Date | string, now: Date = new Date()): number {
  const start = typeof startedAt === 'string' ? new Date(startedAt) : startedAt;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
}

/** `1:47:22` — the timer and menu bar format. Hours are never zero-padded. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / HOUR);
  const m = Math.floor((s % HOUR) / MINUTE);
  const sec = s % MINUTE;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** `1h 47m` — compact form for lists and summaries. */
export function formatCompact(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / HOUR);
  const m = Math.floor((s % HOUR) / MINUTE);
  if (h === 0 && m === 0) return `${s}s`;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Decimal hours for invoicing, rounded to 2dp.
 * Money is computed from this, so rounding happens once, here.
 */
export function toBillableHours(totalSeconds: number): number {
  return Math.round((Math.max(0, totalSeconds) / HOUR) * 100) / 100;
}
