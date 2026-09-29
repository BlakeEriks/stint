'use client';

import {
  hashKey,
  type QueryKey,
  useMutationState,
} from '@tanstack/react-query';
import { useState } from 'react';
import { X } from 'lucide-react';

/**
 * Why the last press didn't take. Read from the mutation cache, not from the
 * component that pressed, so a rollback is explained even after its screen
 * has unmounted (Constitution I). One notice at a time: the newest failure.
 * A later success on the same thing clears it. A form that stays open to show
 * its own error marks itself `inline`.
 */
export function MutationNotice() {
  const presses = useMutationState({
    filters: { predicate: (m) => !m.options.meta?.inline },
    select: (m) => ({
      id: m.mutationId,
      status: m.state.status,
      // What it pressed on: a later success there makes a failure old news.
      on: hashKey((m.state.context as { key?: QueryKey })?.key ?? []),
      message: m.state.error?.message ?? 'That didn’t save.',
    }),
  });
  const [dismissed, setDismissed] = useState(0);

  const retried = (f: (typeof presses)[number]) =>
    presses.some((p) => p.status === 'success' && p.on === f.on && p.id > f.id);
  const shown = presses
    .filter((p) => p.status === 'error' && p.id > dismissed && !retried(p))
    .at(-1);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {shown && (
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-edge-default bg-surface-elevated px-4 py-2 type-support text-primary shadow-float">
          <span>{shown.message}</span>
          <button
            type="button"
            onClick={() => setDismissed(shown.id)}
            className="text-muted hover:text-primary"
            aria-label="Dismiss"
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}
