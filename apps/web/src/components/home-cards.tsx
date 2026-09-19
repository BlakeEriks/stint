'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@stint/core';
import { api, type Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { useClients } from '@/lib/client/use-project-colors';
import { keys } from '@/lib/client/query-keys';
import { useDayState } from '@/lib/client/use-day-state';
import { ByClient, Unbilled } from './home-unbilled';
import { Month } from './home-month';
import { Velocity } from './home-velocity';
import { ByProject } from './home-by-project';
import { Heatmap } from './home-year';

/**
 * The day, and what moved while you were away.
 *
 * The date is the answer to "is this figure current?", which is the question
 * a dashboard that mostly does not change invites. The since-line belongs
 * here rather than on Unbilled because it describes the screen: the money
 * moved, and so did the invoice it was raised against.
 */
function PanelHead({
  delta,
  currency,
}: {
  delta: number | null;
  currency: string;
}) {
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
     to that left 20px under the day name where the mockup has 8. The head
     carries the since-line's space only when the line is there to need it. */
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h2 className="type-heading text-strong">{day}</h2>
        <SinceLine delta={delta} currency={currency} />
      </div>
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
 * The home screen's regions, in three rows: money waiting beside who owes it,
 * the month beside the trailing quarter, then that same quarter by project
 * beside half a year of texture.
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
  const day = useDayState(stats);
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
      <PanelHead delta={day.sinceOpen} currency={data.currency} />
      <Pair
        left={
          <Unbilled
            stats={data}
            earnedToday={day.earnedToday}
            beat={day.beat}
          />
        }
        right={<ByClient stats={data} clients={clients} />}
      />
      <Rule />
      <Pair
        left={<Month stats={data} />}
        right={<Velocity stats={data} beat={day.beat} clients={clients} />}
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
     panel removed and reads the pair as two cards again. */
  return (
    <div className="grid items-start gap-x-6 @2xl:grid-cols-[1.15fr_1fr]">
      {left}
      {right}
    </div>
  );
}

/**
 * What has moved since yesterday closed.
 *
 * Measured against a baseline taken once per local day, so it says the same
 * thing however often the app is opened. A baseline rewritten on every load
 * would make it "since you last had this tab open" instead.
 *
 * Absent on a first load, where `delta` is null: with nothing stored there is
 * no period to name, and "since yesterday" over the user's whole history is a
 * sentence that is simply untrue.
 */
function SinceLine({
  delta,
  currency,
}: {
  delta: number | null;
  currency: string;
}) {
  if (delta == null || delta === 0) return null;

  return (
    <p className="type-support text-subtle">
      Since yesterday,{' '}
      <span className="type-meta tabular-nums text-muted">
        {delta > 0 ? '+' : '−'}
        {formatCurrency(Math.abs(delta), currency)}
      </span>{' '}
      {delta > 0 ? 'unbilled' : 'invoiced'}
    </p>
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
