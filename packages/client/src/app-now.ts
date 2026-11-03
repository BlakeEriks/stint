/**
 * The instant the app treats as now: the real clock, moved by whole days when
 * a tester has chosen another day (the web's `lib/client/today.ts`). Every
 * "what day is it" a screen asks reads it. A timer's elapsed time, a write's
 * timestamp and the server's clock skew read the real clock instead.
 */
let offsetMs = 0;

export function setTodayOffset(ms: number) {
  offsetMs = ms;
}

export function appNow(): Date {
  return new Date(Date.now() + offsetMs);
}

/** Whether a tester moved today, so reads ask the server for it too. */
export function todayMoved(): boolean {
  return offsetMs !== 0;
}
