'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { TimerBar } from './timer-bar';

/**
 * `TimerBar`, wired to its own data so the layout can mount it.
 *
 * The bar needs the project list for its picker. Home used to fetch that and
 * pass it down, which is fine for one screen and wrong for a frame element —
 * the layout is a server component and every route would otherwise have to
 * remember to supply it.
 *
 * The query key is shared with every other `projects` consumer, so this adds
 * no request: React Query dedupes it against whatever the page already asked
 * for.
 */
export function TimerDock() {
  const { data } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects(),
  });

  return <TimerBar projects={data?.projects ?? []} />;
}
