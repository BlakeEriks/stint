'use client';

import { onTimerChanged } from '@stint/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { listenForTimerChanges } from '@/lib/client/timer-changes';

/** Refetches the timer as soon as another client changes it. */
export function TimerChanges() {
  const queryClient = useQueryClient();
  useEffect(
    () => listenForTimerChanges(() => void onTimerChanged(queryClient)),
    [queryClient],
  );
  return null;
}
