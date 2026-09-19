'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { useClients } from '@/lib/client/use-project-colors';
import { keys } from '@/lib/client/query-keys';
import { useBeatOf } from '@/lib/client/use-beat';
import { Collected, Owed } from './home-money';
import { Month } from './home-month';
import { Velocity } from './home-velocity';
import { Heatmap } from './home-year';

/**
 * The day.
 *
 * The date is the answer to "is this figure current?", which is the question
 * a dashboard that mostly does not change invites. What moved is reported
 * beside the figure it moved — the head names the day and nothing else.
 */
function PanelHead() {
  /* Taken once: read in render, the heading would depend on when React
     happened to re-run — every beat and every refetch. */
  const now = useMemo(() => new Date(), []);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(
    now,
  );
  const date = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(now);

  /* No bottom padding: the first region's own `pt-3` follows it, and adding
     to that left 20px under the day name where the mockup has 8. */
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
      <h2 className="min-w-0 type-heading text-strong">{day}</h2>
      <span className="flex-none type-label text-subtle">{date}</span>
    </div>
  );
}

export function HomeCards() {
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });

  if (!data) return null;

  return <Panel stats={data} />;
}

/**
 * The home screen's regions, in three rows: money that arrived beside money
 * that has not, the month beside the trailing quarter, then a year of texture
 * across both.
 *
 * **Nothing here writes.** Every action is a link to the surface that owns
 * the mutation, so a stray click cannot change an invoice.
 *
 * The content column is itself the panel, so no region draws a border, a
 * background or a shadow — a bordered card inside a bordered panel reads as
 * a card in a card. Regions separate by an inset rule.
 *
 * Separate from `HomeCards` so its hooks run below the `!data` guard that
 * makes `stats` defined.
 */
function Panel({ stats }: { stats: Stats }) {
  const beat = useBeatOf(stats);
  const data = stats;

  /* Resolved ONCE for the whole panel and handed down. By-client, Velocity
     and the heatmap all need it, and three subscriptions to one answer is
     three places for the hues to disagree the moment one of them stops
     asking for archived clients. */
  const clients = useClients();

  /* `@container` on the panel, and every pairing below sizes off it. The
     panel is NOT the window: the rail and the dock flank it and claim their
     space at `lg` and `xl`, so the panel is 780px at a 1100px window and
     732px at 1440 — wider at the narrower window. A viewport breakpoint
     would collapse the wide one and split the narrow one. */
  return (
    /* The panel owns its inset: `Page` is `flush` here because its padding
       would land inside this surface, not around it. `pb-4` closes the
       bottom, which the regions' own padding does not reach. */
    <div className="@container flex flex-col pb-4">
      <PanelHead />
      <Pair
        left={<Collected stats={data} beat={beat} />}
        right={<Owed stats={data} beat={beat} clients={clients} />}
      />
      <Rule />
      <Pair
        left={<Month stats={data} />}
        right={<Velocity stats={data} beat={beat} clients={clients} />}
      />
      <Rule />
      <Heatmap clients={clients} />
    </div>
  );
}

/**
 * Two regions side by side, stacked while the panel is narrow.
 *
 * `items-start` so the shorter half does not stretch to the taller one's
 * height and hang its content in the middle of empty space.
 *
 * The left half is the wider: it carries the figures, and an equal split
 * leaves the by-client names truncating while the money column has room to
 * spare.
 */
function Pair({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  /* No vertical divider between the columns, ever. The rules on this screen
     are horizontal and inset; a vertical one rebuilds the gridlines the
     panel removed and reads the pair as two cards again. */
  return (
    <div className="grid items-start gap-x-6 @2xl:grid-cols-[1.15fr_1fr]">
      {left}
      {right}
    </div>
  );
}

/**
 * The rule between two regions.
 *
 * Inset to the regions' own `px-5`, never a `border-b` on a header: full-bleed
 * it cuts the panel in two and reads as two stacked cards.
 */
function Rule() {
  /* 18px each side, which is the panel's rhythm: at `my-1` the regions read
     as a list of rows rather than as four things sharing one surface. */
  return <div className="mx-5 my-[18px] border-t border-edge-subtle" />;
}
