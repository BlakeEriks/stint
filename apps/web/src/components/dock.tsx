'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { useTimeZone } from '@/lib/client/use-timer';
import { NeedsAttention } from './home-cards';

/**
 * The right-hand column, on wide viewports only.
 *
 * It exists for one reason today: **Needs attention needed a fixed region.**
 * The card renders only when something is wrong and vanishes when you fix it,
 * which on Home meant the page reflowing at the moment of success. In a
 * 280px dock the card appearing or clearing moves only what is beneath it in
 * its own column, and the content column does not move at all.
 *
 * It also makes the card *reachable*. On Home it was visible only from Home —
 * an invoice going overdue while you were on Clients or Calendar said nothing
 * until you happened to navigate back.
 *
 * **Deliberately holding one card.** The point of a persistent column is to
 * find out whether 280px permanently spent is worth it, and that question is
 * answerable with the card that has the real placement problem. Filling it
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
      className="hidden w-[280px] flex-none overflow-y-auto border-l border-edge-subtle p-4 xl:block"
    >
      {data ? <NeedsAttention stats={data} /> : null}
    </aside>
  );
}
