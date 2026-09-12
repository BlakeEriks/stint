'use client';

import Link from 'next/link';
import { formatClock } from '@stint/core';
import { useTimer } from '@/lib/client/use-timer';

/**
 * UNUSED. The rail's running-timer readout, replaced by the docked timer bar
 * (`timer-bar.tsx`, mounted in the `(app)` layout).
 *
 * Kept for one release the way `activity-strip.tsx` was: if the dock turns
 * out to be wrong, this is what comes back. Delete it once the dock has
 * proven itself.
 *
 * It is also worth keeping the argument that was here, because it was wrong
 * in an instructive way. This component claimed that showing the timer in
 * both the rail and the Home hero was fine — "both marks are the same fact,
 * so they reinforce each other rather than compete". On a wide screen that
 * was two identical green clocks a few inches apart, and it read as a
 * duplicate, not as reinforcement. The rule about one accent meaning was
 * right; the exception carved out for it was a rationalisation.
 */
export function NavTimer({ onTimerScreen }: { onTimerScreen: boolean }) {
  const timer = useTimer();

  if (!timer.running) {
    return (
      // `role="status"` so the aria-label is actually honoured: a bare
      // <span> has no role, and screen readers ignore a label on it.
      <span
        role="status"
        className="type-meta text-subtle"
        aria-label={`No timer running. ${formatClock(timer.todaySeconds)} logged today.`}
      >
        {formatClock(timer.todaySeconds)}
        <span className="hidden sm:inline"> today</span>
      </span>
    );
  }

  const tone = timer.exceedsThreshold ? 'text-warning' : 'text-accent-default';

  const body = (
    <>
      <span
        aria-hidden
        className={`size-1.5 flex-none rounded-full ${
          timer.exceedsThreshold
            ? 'bg-warning'
            : 'bg-accent-default motion-safe:animate-pulse'
        }`}
      />
      <span className={`type-meta ${tone}`}>{formatClock(timer.seconds)}</span>
      <span className="hidden max-w-[12ch] truncate type-support text-subtle md:inline">
        {timer.running.taskName || 'Untitled'}
      </span>
    </>
  );

  // Only a link when it goes somewhere: on the timer screen it is already here.
  return !onTimerScreen ? (
    <Link
      href="/"
      aria-label={`Timer running: ${formatClock(timer.seconds)}. Go to timer.`}
      className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-hover"
    >
      {body}
    </Link>
  ) : (
    <span className="flex items-center gap-2 px-2 py-1">{body}</span>
  );
}
