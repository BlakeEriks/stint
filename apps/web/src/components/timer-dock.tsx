'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { TimerBar } from './timer-bar';
import { keys } from '@/lib/client/query-keys';

/**
 * `TimerBar`, wired to its own data so the server-component layout can mount
 * it. The shared `projects` key means React Query dedupes this against
 * whatever the page already asked for.
 */
export function TimerDock() {
  const { data } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });

  return <TimerBar projects={data?.projects ?? []} />;
}
