'use client';

import { useMutationState } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Why the last press didn't take. Read from the mutation cache, not from the
 * component that pressed, so a rollback is explained even after its screen
 * has unmounted (Constitution I). One notice at a time: the newest failure.
 */
export function MutationNotice() {
  const failures = useMutationState({
    filters: { status: 'error' },
    select: (m) => ({
      id: m.mutationId,
      at: m.state.submittedAt,
      message: m.state.error?.message ?? 'That didn’t save.',
    }),
  });
  const [dismissed, setDismissed] = useState(0);

  const latest = failures.reduce<(typeof failures)[number] | undefined>(
    (a, b) => (!a || b.at > a.at ? b : a),
    undefined,
  );
  const shown = latest && latest.id > dismissed ? latest : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {shown && (
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-edge-default bg-surface-elevated px-4 py-2 text-sm text-primary shadow-float">
          <span>{shown.message}</span>
          <button
            type="button"
            onClick={() => setDismissed(shown.id)}
            className="text-muted hover:text-primary"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
