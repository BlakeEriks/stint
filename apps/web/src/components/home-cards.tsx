'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usePressedSince, keys } from '@stint/client';
import {
  api,
  type Client,
  type Project,
  type Stats,
  type TimeEntry,
} from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
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
import { Settling } from './money';
import { rowBleed, rowButton } from './row-button';

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
  const clients = useClientsQuery();
  const projects = useAllProjects();

  return (
    <Settling value={settling}>
      <Listing query={[stats, useTodayEntries()]} also={[clients, projects]}>
        {([data, today]) =>
          neverTracked(
            data,
            today.entries,
            clients.data?.clients,
            projects.data?.projects,
          ) ? (
            <FirstRun />
          ) : (
            <Panel stats={data} />
          )
        }
      </Listing>
    </Settling>
  );
}

/**
 * A new account: no client or project ever made, archived ones included, and
 * nothing in any window Home draws. Not the windows alone: an account with
 * work behind it keeps its cards through an empty week and month, which say
 * it is quiet, not new. Clients or projects that failed to load count as
 * some, so a failure never shows the intro to an established account.
 */
function neverTracked(
  stats: Stats,
  today: TimeEntry[],
  clients: Client[] | undefined,
  projects: Project[] | undefined,
) {
  return (
    clients?.length === 0 &&
    projects?.length === 0 &&
    today.length === 0 &&
    stats.earnedToday === 0 &&
    stats.unbilled.seconds === 0 &&
    stats.awaitingPayment === 0 &&
    stats.month.earned === 0 &&
    stats.week.every((d) => d.seconds === 0)
  );
}

/** What Home will show, and the first steps toward it. */
function FirstRun() {
  return (
    <section
      data-first-run
      aria-labelledby="first-run-title"
      className="flex max-w-xl flex-col px-[18px] pt-5 pb-3.5"
    >
      <h2 id="first-run-title" className="type-heading text-strong">
        Home fills in as you track
      </h2>
      <p className="mt-2 type-support text-muted">
        What today, this week and this month have earned, and what is still
        unbilled. Start a timer, or add time you already worked.
      </p>
      <ul className="mt-4">
        <Step href="/clients">Add a client and their rate</Step>
        <Step href="/calendar">Add time on the calendar</Step>
        <Step href="/settings/import">Import your Toggl history</Step>
      </ul>
    </section>
  );
}

function Step({ href, children }: { href: string; children: string }) {
  return (
    <li className="border-t border-edge-subtle first:border-t-0">
      <Link
        href={href}
        className={`${rowButton} ${rowBleed} flex items-center gap-2.5 py-2.5 type-control text-primary`}
      >
        <span className="flex-1">{children}</span>
        <ArrowRight aria-hidden className="size-3.5 flex-none text-subtle" />
      </Link>
    </li>
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
