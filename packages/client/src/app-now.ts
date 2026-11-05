/**
 * The instant the app treats as now: the real clock, moved to the same wall
 * clock time on the day a tester chose (the web's `lib/client/today.ts`). A
 * screen reads it to ask what day it is. Whatever the server dates on the
 * real day reads the real clock instead: a timer's elapsed time and the day
 * its stop lands on, a write's timestamp, a new invoice's dates, and the
 * server's clock skew.
 */
let offsetMs = 0;

export function setTodayOffset(ms: number) {
  offsetMs = ms;
}

export function appNow(): Date {
  return new Date(Date.now() + offsetMs);
}

export function todayMoved(): boolean {
  return offsetMs !== 0;
}
