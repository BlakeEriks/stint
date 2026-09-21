'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCompact, localDateKey } from '@stint/core';
import { api, type Stats, type TimeEntry } from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';
import { timeZone as tz } from '@/lib/client/use-timer';
import { useProjectColors } from '@/lib/client/use-project-colors';
import { Money } from './money';
import { FigGroup, FigLabel, PairLine, RegionHead, Pip } from './home-shell';

/**
 * Today: one figure and the day's entries.
 *
 * The narrow third of the top row — a figure and a few short rows, against
 * the week's chart which wants the long axis
 * (`docs/design/screens/home.html`).
 */
export function Today({ stats }: { stats: Stats }) {
  const colors = useProjectColors();

  /* Taken once: read in render, the date would depend on when React happened
     to re-run — every beat and every refetch. */
  const today = useMemo(() => localDateKey(new Date(), tz), []);

  /* The day's own entries. `/stats` carries `earnedToday` but no rows, and
     the list is what makes the figure something the user can account for. */
  const { data } = useQuery({
    queryKey: keys.entries({ from: today }),
    queryFn: () => api.entries({ from: today, to: today }),
  });

  const entries = data?.entries ?? [];
  const seconds = entries.reduce((sum, e) => sum + secondsOf(e), 0);

  return (
    <div className="flex flex-col">
      <RegionHead>Today · {dayLabel()}</RegionHead>

      <FigGroup tier="major" className="mt-6">
        <FigLabel>Earned</FigLabel>
        <PairLine>
          <Money
            amount={stats.earnedToday}
            currency={stats.currency}
            className="type-figure text-strong"
          />
          <span className="type-duration text-subtle">
            {formatCompact(seconds)}
          </span>
        </PairLine>
      </FigGroup>

      {entries.length > 0 ? (
        <div className="mt-6 flex flex-col">
          {entries.map((e) => (
            <div
              key={e.id}
              data-entry={e.id}
              className="grid grid-cols-[9px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-edge-subtle py-2.5 first:border-t-0"
            >
              {/* Only clients have a colour; internal work takes the hollow
                  ring, which is what having none looks like on a screen
                  otherwise keyed by client. */}
              <Pip
                color={e.projectId ? (colors.get(e.projectId) ?? null) : null}
              />
              <span
                className={`type-support truncate ${
                  e.endedAt === null ? 'text-primary' : 'text-muted'
                }`}
              >
                {e.taskName || 'Untitled'}
              </span>
              <span className="type-duration text-subtle">
                {clock(secondsOf(e))}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A running entry has no `durationSeconds`, so its length is measured from
 * its start. Without this the live row reads `0:00` for the whole session.
 */
function secondsOf(e: TimeEntry): number {
  if (e.durationSeconds != null) return e.durationSeconds;
  if (e.endedAt !== null) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(e.startedAt).getTime()) / 1000),
  );
}

/** `4:15` — an entry's own length, beside `5h 00m` for the day's total. */
function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/* Browser locale, like every other date on this screen: a header reading
   "Thursday, Sep 17" beside one reading "17 sept." is the app disagreeing
   with itself. */
function dayLabel(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
}
