'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { useTimeZone } from '@/lib/client/use-timer';
import { Inbox } from './inbox';

/**
 * The right-hand column, on wide viewports only.
 *
 * It exists to give the inbox a fixed region. As a card on Home that content
 * appeared only when something was wrong and vanished when you fixed it, so
 * the page reflowed at the moment of success and the section was somewhere
 * you could not reliably find. Here it is furniture: always present, empty
 * when there is nothing, and visible from every route rather than only from
 * Home — an invoice going overdue while you were on Clients previously said
 * nothing until you navigated back.
 *
 * **Deliberately holding one section.** The point of a persistent column is
 * to find out whether 280px permanently spent is worth it, and that is
 * answerable with the content that had the real placement problem. Filling it
 * first would make the answer unmeasurable.
 *
 * **What does not belong here.** Pace is a monthly reading checked a few
 * times a month, not while working. The activity chart needs width — 30 bars
 * in 280px is the ~4px bar that ruled out a 90-day view. Both stay on Home,
 * which is what keeps Home worth opening.
 *
 * It is hidden below `xl` (1280px). Rail 208 + dock 280 leaves under 700px of
 * content at 1280, narrower than Home is today, so the dock has to be the
 * thing that yields. Every card in it therefore needs a home on a narrower
 * screen too — which is the argument for Home continuing to exist.
 */
export function Dock() {
  const tz = useTimeZone();
  const { data } = useQuery({
    queryKey: ['stats', tz],
    queryFn: () => api.stats(tz),
  });

  return (
    <aside
      aria-label="At a glance"
      /* `bg-surface-recessed`, the same surface as the header, rail and timer
         bar. All four perimeter elements are one enclosure — the header and
         bar are its top and bottom edges, the rail and dock its sides — so
         tiering them into separate tones would say they are different kinds
         of thing when they are not. The one distinction that carries meaning
         is chrome against content, and that is the step from recessed to
         base. */
      className="hidden w-[280px] flex-none overflow-y-auto border-l border-edge-subtle bg-surface-recessed p-4 xl:block"
    >
      {data ? <Inbox stats={data} /> : null}
    </aside>
  );
}
