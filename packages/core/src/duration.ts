/** Duration formatting. Every number the user sees passes through here. */

export const SECOND = 1;
export const MINUTE = 60;
export const HOUR = 3600;

/**
 * Seconds elapsed between two instants, floored at 0. Only the ticking
 * readout uses it: flooring turns over each second on the second.
 */
export function elapsedSeconds(
  startedAt: Date | string,
  now: Date = new Date(),
): number {
  const start = typeof startedAt === 'string' ? new Date(startedAt) : startedAt;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
}

/**
 * A running entry's length as the server reports it: rounded to the nearest
 * second, as `entry_seconds()` and the generated `duration_seconds` round, so
 * a row and the figures beside it agree, and stopping moves neither.
 * `rates.test.ts` holds it to the SQL.
 */
export function entrySeconds(startedAt: Date | string, now: Date): number {
  const start = typeof startedAt === 'string' ? new Date(startedAt) : startedAt;
  return Math.max(0, Math.round((now.getTime() - start.getTime()) / 1000));
}

/**
 * An entry with a running one's length so far filled in. `endedAt` stays
 * null: that, not a null duration, is what marks it running.
 */
export function measured<
  E extends {
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
  },
>(entry: E, now: Date): E {
  return entry.endedAt === null
    ? { ...entry, durationSeconds: entrySeconds(entry.startedAt, now) }
    : entry;
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
