'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { timeZone as tz, useTimer } from '@/lib/client/use-timer';
import { EntryList } from './entry-list';
import { Inbox } from './inbox';
import { keys } from '@/lib/client/query-keys';

/**
 * The frame's inbox column: furniture, always present and empty when there is
 * nothing. Present at every width — below `xl` it becomes a band beneath the
 * content rather than a side column.
 *
 * Painted onto the ground beside the panel, with no surface and no rule of
 * its own: the rows inside it carry the only fill, because a row you act on
 * is an object and the column holding them is not.
 */
export function Dock() {
  const timer = useTimer();
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });
  const { data: projects } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });

  return (
    <aside
      aria-label="At a glance"
      /* 372px, because the inbox's actions are labelled: `Mark STINT-0014
         paid` beside `Download` needs 263px of row. Today adapts to this
         width, never the reverse. */
      className="flex-none xl:col-start-3 xl:row-start-1 xl:w-[372px] xl:overflow-y-auto"
    >
      {/* Today has its own `/entries` query, so it waits on stats for nothing. */}
      {data ? <Inbox stats={data} /> : null}
      <EntryList
        projects={projects?.projects ?? []}
        todaySeconds={timer.todaySeconds}
      />
    </aside>
  );
}
