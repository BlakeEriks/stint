'use client';

import {
  hashKey,
  type QueryKey,
  useMutationState,
} from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Why the last press didn't take. Read from the mutation cache, not from the
 * component that pressed, so a rollback is explained even after its screen
 * has unmounted (Constitution I). One at a time: the newest failure. A later
 * success on the same thing clears it. A form that stays open to show its
 * own error marks itself `inline`. Each app's notice renders it.
 */
export function useFailedPress(): {
  message: string;
  dismiss: () => void;
} | null {
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

  return shown
    ? { message: shown.message, dismiss: () => setDismissed(shown.id) }
    : null;
}
