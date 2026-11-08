'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePressedSince, keys } from '@stint/client';
import { api, type Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import {
  useAllProjects,
  useClients,
  useClientsQuery,
} from '@/lib/client/use-project-colors';
import { buildHues, type Hue, Legend } from './home-shell';
import { Today } from './home-today';
import { useTodayEntries } from '@/lib/client/use-today-entries';
import { Week } from './home-week';
import { Month } from './home-month';
import { Listing } from './page';
import { Settling } from './money';

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

  const settling = usePressedSince(stats.dataUpdatedAt);

  return (
    <Settling value={settling}>
      <Listing
        query={[stats, useTodayEntries()]}
        also={[useClientsQuery(), useAllProjects()]}
      >
        {([data]) => <Panel stats={data} />}
      </Listing>
    </Settling>
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

  if (stats.hasEntries) return <Cards stats={stats} hues={hues} />;

  /* Before any entry the cards read as dashes and zeros, so they stay as the
     shape Home will take, blurred behind the one thing to do first. */
  return (
    <div className="relative">
      <div inert className="blur-sm">
        <Cards stats={stats} hues={hues} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div
          role="status"
          className="max-w-sm rounded-lg border border-edge-subtle bg-surface-elevated p-6 text-center shadow-float"
        >
          <h2 className="type-heading text-strong">Add your first entry</h2>
          <p className="mt-1.5 type-body text-muted">
            Start a timer or add an entry, and Home fills in as your time
            entries arrive.
          </p>
        </div>
      </div>
    </div>
  );
}

function Cards({ stats, hues }: { stats: Stats; hues: Map<string, Hue> }) {
  /* `@container` on the panel, and the regions size off it. The panel is NOT
     the window: the rail and the dock flank it and claim their space at `lg`
     and `xl`, so the panel is 780px at a 1100px window and 732px at 1440 —
     wider at the narrower window. A viewport breakpoint would collapse the
     wide one and split the narrow one.

     `--grow` is what the top row's chart and the month's each gain past the
     646px panel of a 13-inch MacBook's 790px window, half the extra apiece,
     so a taller screen fills rather than leaving a gap. The panel is the
     window less 144px of frame from `xl`, and less 194px inside `2xl`'s
     card. It stops at 74px, where that card reaches its 940px ceiling. */
  return (
    <div className="@container flex flex-col px-[18px] pt-4 pb-3.5 xl:[--grow:clamp(0px,calc((100dvh_-_790px)/2),74px)] 2xl:[--grow:clamp(0px,calc((100dvh_-_840px)/2),74px)]">
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
