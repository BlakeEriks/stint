'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { keys } from '@/lib/client/query-keys';
import { useClients } from '@/lib/client/use-project-colors';
import { buildHues, Legend } from './home-shell';
import { Today } from './home-today';
import { Week } from './home-week';
import { Month } from './home-month';

export function HomeCards() {
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });

  if (!data) return null;

  return <Panel stats={data} />;
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
 * Separate from `HomeCards` so its hooks run below the `!data` guard that
 * makes `stats` defined.
 */
function Panel({ stats }: { stats: Stats }) {
  const clients = useClients();

  /* How each of the week's days divides by client, in SECONDS — the stack's
     own measure. `/stats.week` carries each bar's height and its money and
     says nothing about who the hours belonged to; this is the only call that
     does. The window is the week the bars already hold, so nothing is
     fetched that is not drawn. */
  const first = stats.week[0]?.date;
  const last = stats.week.at(-1)?.date;
  const { data: activity } = useQuery({
    queryKey: keys.activity(tz, stats.week.length),
    queryFn: () =>
      api.activity({
        from: `${first}T00:00:00.000Z`,
        to: `${last}T23:59:59.999Z`,
        tz,
      }),
    enabled: first != null && last != null,
  });

  const byDay = useMemo(
    () =>
      new Map((activity?.days ?? []).map((d) => [d.date, d.byClient] as const)),
    [activity],
  );

  /* ONE palette for the whole panel, built once here and passed down. Two
     regions each deriving their own order is two orders to keep in
     agreement, and a palette that reorders between two regions of one panel
     means nothing (`docs/design/screens/home.html`). */
  const hues = useMemo(() => {
    const weekKeys = new Set<string>();
    for (const day of byDay.values()) {
      for (const key of Object.keys(day)) weekKeys.add(key);
    }
    return buildHues({ byClient: stats.month.byClient, weekKeys, clients });
  }, [stats.month.byClient, byDay, clients]);

  /* `@container` on the panel, and the regions size off it. The panel is NOT
     the window: the rail and the dock flank it and claim their space at `lg`
     and `xl`, so the panel is 780px at a 1100px window and 732px at 1440 —
     wider at the narrower window. A viewport breakpoint would collapse the
     wide one and split the narrow one. */
  return (
    <div className="@container flex flex-col px-[18px] py-5">
      {/* Today takes a third of the top row and the week two thirds: today's
          content is a figure and a few short rows, and the week's chart needs
          the long axis for seven columns and their captions. The rule between
          them is the only edge inside the panel. */}
      <div className="grid grid-cols-[minmax(0,1fr)] @2xl:grid-cols-[1fr_2fr]">
        <div className="border-b border-edge-subtle pb-6 @2xl:border-r @2xl:border-b-0 @2xl:pr-7 @2xl:pb-0">
          <Today stats={stats} />
        </div>
        <div className="pt-6 @2xl:pt-0 @2xl:pl-7">
          <Week stats={stats} hues={hues} byDay={byDay} />
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
