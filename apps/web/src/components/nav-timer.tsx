'use client';

import Link from 'next/link';
import { formatClock } from '@stint/core';
import { useTimer } from '@/lib/client/use-timer';

/**
 * The running timer, visible from every screen.
 *
 * It lives in the nav row rather than a reserved band or a floating overlay:
 * the row already exists on every page and is mostly empty, so this costs no
 * vertical space and never overlaps content. It is also the same data and the
 * same toggle the macOS menu bar shows, from the same `/summary` call.
 *
 * It is green on every screen, including the timer screen. That is a
 * deliberate exception to "at most one accent in view": both marks are the
 * *same* fact — this timer is running — so they reinforce each other rather
 * than compete. The rule exists to stop green meaning several different
 * things at once, which is not what happens here.
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
