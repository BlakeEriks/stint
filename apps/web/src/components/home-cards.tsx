'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { keys } from '@/lib/client/query-keys';
import {
  useAllProjects,
  useClients,
  useClientsQuery,
} from '@/lib/client/use-project-colors';
import { buildHues, Legend } from './home-shell';
import { Today, useTodayEntries } from './home-today';
import { Week } from './home-week';
import { Month } from './home-month';
import { Listing } from './page';

/**
 * The panel paints once, with everything it draws: the gate holds the
 * queries its regions read, so on the first frame past it every bar has its
 * client's hue and Today has its rows. Colors are `also`: if they fail, the
 * bars draw neutral rather than the panel going blank.
 */
export function HomeCards() {
  const stats = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });

  return (
    <Listing
      query={[stats, useTodayEntries()]}
      also={[useClientsQuery(), useAllProjects()]}
    >
      {([data]) => <Panel stats={data} />}
    </Listing>
  );
}

/**
 * One panel, three regions.
 *
 * Today and this week share the top row, split by a vertical rule; the month
 * runs the full width beneath a horizontal one. **Nothing inside the panel
 * carries a border, a background or a shadow of its own** — the content column
 * IS the panel, and a second set inside it reads as a card in a card.
 *
 * **Nothing here writes.** Every region reads, and an action on one is a link
 * to the surface that owns the mutation.
 *
 * Separate from `HomeCards` so its hooks run below the `Listing` that makes
 * `stats` defined.
 */
function Panel({ stats }: { stats: Stats }) {
  const clients = useClients();

  /* ONE palette for the whole panel, built once here and passed down. Two
     regions each deriving their own order is two orders to keep in
     agreement, and a palette that reorders between two regions of one panel
     means nothing. */
  const hues = useMemo(() => {
    const weekKeys = new Set<string>();
    for (const day of stats.week) {
      for (const key of Object.keys(day.byClient)) weekKeys.add(key);
    }
    return buildHues({ byClient: stats.month.byClient, weekKeys, clients });
  }, [stats.month.byClient, stats.week, clients]);

  /* `@container` on the panel, and the regions size off it. The panel is NOT
     the window: the rail and the dock flank it and claim their space at `lg`
     and `xl`, so the panel is 780px at a 1100px window and 732px at 1440 —
     wider at the narrower window. A viewport breakpoint would collapse the
     wide one and split the narrow one. */
  return (
    <div className="@container flex flex-col px-[18px] pt-5 pb-3.5">
      {/* Today takes a third of the top row and the week two thirds: today's
          content is a figure and a few short rows, and the week's chart needs
          the long axis for seven columns and their captions. The rule between
          them is the only edge inside the panel. */}
      <div className="grid grid-cols-[minmax(0,1fr)] @2xl:grid-cols-[1fr_2fr]">
        <div className="border-b border-edge-subtle pb-6 @2xl:border-r @2xl:border-b-0 @2xl:pr-7 @2xl:pb-0">
          <Today stats={stats} />
        </div>
        <div className="pt-6 @2xl:pt-0 @2xl:pl-7">
          <Week stats={stats} hues={hues} />
        </div>
      </div>

      <Month stats={stats} hues={hues} />

      {/* ONE legend for the panel, naming every hue drawn above it: the bars
          and the strip draw from one set of clients, and two keys for one
          palette is a second thing to keep in agreement. */}
      <Legend hues={hues} />
    </div>
  );
}
