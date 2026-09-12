/**
 * Timer state derivation.
 *
 * The server owns whether a timer is running. These helpers only derive
 * DISPLAY state from a known entry — they never decide to start or stop.
 */

import { elapsedSeconds } from './duration.ts';

export interface RunningEntry {
  id: string;
  taskName: string;
  projectId: string | null;
  startedAt: string;
}

export type TimerDisplayState = 'idle' | 'running' | 'exceeded';

export interface TimerView {
  state: TimerDisplayState;
  seconds: number;
  /** True once past the user's max_timer_hours threshold. */
  exceedsThreshold: boolean;
}

/**
 * Derive what to show. Pure, so every client ticks identically and the
 * menu bar can count locally between server reconciliations.
 */
export function deriveTimerView(
  entry: RunningEntry | null,
  maxTimerHours: number,
  now: Date = new Date(),
): TimerView {
  if (!entry) {
    return { state: 'idle', seconds: 0, exceedsThreshold: false };
  }
  const seconds = elapsedSeconds(entry.startedAt, now);
  const exceeds = seconds > maxTimerHours * 3600;
  return {
    state: exceeds ? 'exceeded' : 'running',
    seconds,
    exceedsThreshold: exceeds,
  };
}
