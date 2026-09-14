'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { Inbox } from './inbox';
import { keys } from '@/lib/client/query-keys';

/**
 * The frame's inbox column: furniture, always present and empty when there is
 * nothing. Present at every width — below `xl` it becomes a band beneath the
 * content rather than a side column.
 */
export function Dock() {
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });

  return (
    <aside
      aria-label="At a glance"
      /* 372px, because the inbox's actions are labelled: `Mark STINT-0014
         paid` beside `Download` needs 263px of row. */
      className="flex-none border-t border-edge-subtle bg-surface-base p-4
                 xl:w-[372px] xl:overflow-y-auto xl:border-t-0 xl:border-l"
    >
      {data ? <Inbox stats={data} /> : null}
    </aside>
  );
}
