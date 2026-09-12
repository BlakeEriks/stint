'use client';

import type { SaveState } from '@/lib/client/use-autosave';

/**
 * Per-card save status.
 *
 * A dot at rest rather than a checkmark: a check that is always there says
 * nothing, and stops being read. The check appears only after a save the
 * user actually caused, so it answers "did that land?" and nothing else.
 */
export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'error') {
    return (
      <span
        role="status"
        className="flex items-center gap-1.5 type-support text-danger"
      >
        <svg viewBox="0 0 12 12" aria-hidden className="size-3 fill-current">
          <path d="M6 0a6 6 0 100 12A6 6 0 006 0zm.75 9h-1.5V7.5h1.5V9zm0-2.5h-1.5V3h1.5v3.5z" />
        </svg>
        Not saved
      </span>
    );
  }

  if (state === 'pending') {
    return (
      <span role="status" aria-label="Saving">
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="size-3.5 motion-safe:animate-spin"
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2"
            className="stroke-edge-default"
          />
          <path
            d="M8 2a6 6 0 016 6"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            className="stroke-muted"
          />
        </svg>
      </span>
    );
  }

  if (state === 'saved') {
    return (
      <span role="status" aria-label="Saved" className="text-success">
        <svg
          viewBox="0 0 14 14"
          aria-hidden
          className="size-3.5 fill-none stroke-current"
          strokeWidth="2"
        >
          <path
            d="M2.5 7.5l3 3 6-6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  // Idle: present but silent, so the row does not reflow when a save starts.
  return (
    <span aria-hidden className="block size-1.5 rounded-full bg-timer-idle" />
  );
}
