'use client';

import {
  hashKey,
  type QueryKey,
  useMutationState,
} from '@tanstack/react-query';
import { useState } from 'react';

/**
 * What the last press needs to tell the user: why it didn't take, or what a
 * press that took did beyond what was pressed (an entry re-dated off its
 * draft). Read from the mutation cache, not from the component that
 * pressed, so it's said even after its screen has unmounted (Constitution
 * I). One at a time: the newest. A later success on the same thing clears a
 * failure. A form that stays open to show its own error marks itself
 * `inline`, which hides only its failures: it closes on success. Each app's
 * notice renders it.
 */
export function usePressNotice(): {
  message: string;
  dismiss: () => void;
} | null {
  const presses = useMutationState({
    select: (m) => ({
      id: m.mutationId,
      inline: Boolean(m.options.meta?.inline),
      status: m.state.status,
      // What it pressed on: a later success there makes a failure old news.
      on: hashKey((m.state.context as { key?: QueryKey })?.key ?? []),
      message: m.state.error?.message ?? 'That didn’t save.',
      released: (m.state.data as { releasedFrom?: string } | undefined)
        ?.releasedFrom,
    }),
  });
  const [dismissed, setDismissed] = useState(0);

  const retried = (f: (typeof presses)[number]) =>
    presses.some((p) => p.status === 'success' && p.on === f.on && p.id > f.id);
  const shown = presses
    .filter(
      (p) =>
        p.id > dismissed &&
        ((p.status === 'error' && !p.inline && !retried(p)) ||
          (p.status === 'success' && p.released)),
    )
    .at(-1);
  if (!shown) return null;

  return {
    message:
      shown.status === 'success'
        ? `Taken off draft ${shown.released}: its new date is outside that invoice’s period.`
        : shown.message,
    dismiss: () => setDismissed(shown.id),
  };
}
