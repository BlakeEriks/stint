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
      /* 286px, the mockup's width. The widest action strip is `Mark paid`
         beside `Download` at 190px, so this clears the only hard floor with
         room to spare. Today adapts to this width, never the reverse.

         At `xl` it spans BOTH grid rows. The timer bar is placed in the
         content column, so the third column's second row is otherwise the
         bar's height of empty ground — and Today is the region that can use
         it.

         The column itself does not scroll: the inbox holds its place and
         Today scrolls inside it. An inbox that scrolls away is an inbox you
         forget, and the reward for clearing it is the grid growing into the
         space it leaves. */
      className="flex min-h-0 flex-none flex-col xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:w-[286px]"
    >
      {/* Today has its own `/entries` query, so it waits on stats for nothing.

          `flex-none` so the inbox keeps its full height and Today gives way
          instead: the whole point is that the inbox does not move. A long
          inbox squeezes the grid, which is the pressure that gets it
          cleared. */}
      {data ? (
        <div className="flex-none">
          <Inbox stats={data} />
        </div>
      ) : null}
      <EntryList
        compact
        grid
        projects={projects?.projects ?? []}
        todaySeconds={timer.todaySeconds}
      />
    </aside>
  );
}
