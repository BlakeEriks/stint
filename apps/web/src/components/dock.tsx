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
 * **It is present at every width**, because the inbox has exactly one home
 * and duplicating it onto Home for narrow screens is what produced the same
 * content under two names, renaming itself as you crossed a breakpoint.
 *
 * Below `xl` it stops being a side column — rail 208 + dock 280 would leave
 * under 700px of content — and becomes a band beneath the content instead,
 * still inside the frame and still above the timer bar. The section keeps its
 * identity and its position in the reading order; only its axis changes.
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
      className="flex-none border-t border-edge-subtle bg-surface-recessed p-4
                 xl:w-[280px] xl:overflow-y-auto xl:border-t-0 xl:border-l"
    >
      {data ? <Inbox stats={data} /> : null}
    </aside>
  );
}
