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

         The column itself does not scroll. It splits: each region is given
         HALF and scrolls inside its own half, so neither can push the other
         off. An inbox that scrolls away is an inbox you forget, and a
         calendar crushed to a sliver is one you cannot read — the half is
         the floor that stops either.

         Half is a floor, not a fence: `basis-1/2` with shrink allowed means
         a region that wants less gives the remainder to the other, so a
         cleared inbox still hands Today the whole column. */
      className="flex min-h-0 flex-none flex-col xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:w-[286px]"
    >
      {/* Today has its own `/entries` query, so it waits on stats for nothing.

          The inbox takes its own half and scrolls within it. `min-h-0` is
          what lets it shrink below its content so the scroller engages
          rather than the column growing. */}
      {data ? (
        <div className="xl:max-h-1/2 xl:min-h-0 xl:flex-none xl:overflow-y-auto">
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
