'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { useClients } from '@/lib/client/use-project-colors';
import { keys } from '@/lib/client/query-keys';
import { useBeatOf } from '@/lib/client/use-beat';
import { INSET, INSET_X } from './home-shell';
import { Collected, Owed } from './home-money';
import { Month } from './home-month';
import { Velocity } from './home-velocity';
import { ByProject } from './home-by-project';
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
    <div className={`flex items-baseline justify-between gap-3 ${INSET} pt-4`}>
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
 * that has not, the month beside the trailing quarter, then that quarter by
 * project beside half a year of texture.
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

  /* Resolved ONCE for the whole panel and handed down. By-client, Velocity,
     By project and the heatmap all need it, and four subscriptions to one
     answer is four places for the hues to disagree the moment one of them
     stops asking for archived clients.

     By project resolves from this map rather than `useProjectClients()`: its
     rows already carry `clientId`, so the project-to-client hop that hook
     exists for is one the data has already made, and taking it would add a
     projects fetch to this screen for an answer it is holding. */
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
      <Pair
        left={<ByProject stats={data} clients={clients} />}
        right={<Heatmap clients={clients} />}
      />
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
     panel removed and reads the pair as two cards again.

     One ratio for every row, so the gutter falls in the same place down the
     whole panel. A row on its own split puts the gutter somewhere else, and
     one that lands on the other side of the panel's centre reads as a
     mistake rather than as an asymmetry anyone chose. */
  return (
    <div className="grid items-start @2xl:grid-cols-[1.15fr_1fr]">
      {left}
      {right}
    </div>
  );
}

/**
 * The rule between two regions.
 *
 * Inset to the regions' own `INSET`, never a `border-b` on a header: full-bleed
 * it cuts the panel in two and reads as two stacked cards.
 */
function Rule() {
  /* The regions' own padding is the rest of the distance: a body's `pb-3` and
     a section's `py-1` sit between the rule and the nearest ink, so 6px here
     puts content 22px from the line.

     22 is `INSET` plus that section step, and it runs looser than the 18px
     between two halves on purpose — that gap is empty, while this one has a
     rule drawn through it, and a line needs clearance the empty gap does
     not. */
  return <div className={`${INSET_X} my-1.5 border-t border-edge-subtle`} />;
}
