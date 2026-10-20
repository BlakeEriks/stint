'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { TimerBar } from './timer-bar';
import { useTimer } from '@/lib/client/use-timer';
import { useHydrated } from '@/lib/client/use-hydrated';
import { keys } from '@/lib/client/query-keys';

/**
 * `TimerBar`, wired to its own data so the server-component layout can mount
 * it. The shared `projects` key means React Query dedupes this against
 * whatever the page already asked for.
 */
export function TimerDock() {
  const timer = useTimer();
  const hydrated = useHydrated();
  const projects = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });

  /* Not a `Listing`: the bar is the frame's and keeps its place while it
     waits, where `Listing` would put a loader in its stead. Pending, not a
     missing answer: a failed fetch still leaves a timer the
     user can start, while a cache still restoring has answered nothing. */
  return (
    <TimerBar
      projects={projects.data?.projects ?? []}
      pending={!hydrated || timer.isPending || projects.isPending}
    />
  );
}
