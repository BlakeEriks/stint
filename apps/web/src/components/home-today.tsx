'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCompact, localDateKey } from '@stint/core';
import {
  api,
  type Project,
  type Stats,
  type TimeEntry,
} from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';
import { timeZone as tz } from '@/lib/client/use-timer';
import { useProjectColors } from '@/lib/client/use-project-colors';
import { Money } from './money';
import { FigGroup, FigLabel, PairLine, RegionHead, Pip } from './home-shell';

/**
 * Today: one figure and the day's tasks.
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
    /* `ListEntriesQuery` takes ISO datetimes with an offset, not a date key:
       a bare `2026-09-21` fails validation and the list renders empty on a
       day that has work in it. */
    queryFn: () =>
      api.entries({
        from: `${today}T00:00:00.000Z`,
        to: `${today}T23:59:59.999Z`,
      }),
  });

  /* Archived included: a project archived since this morning still named
     the work done under it. */
  const { data: projectData } = useQuery({
    queryKey: keys.projects({ archived: true }),
    queryFn: () => api.projects({ includeArchived: true }),
  });

  const entries = data?.entries ?? [];
  const seconds = entries.reduce((sum, e) => sum + secondsOf(e), 0);
  const tasks = groupByTask(entries, projectData?.projects ?? []);

  /* Three, because it is what the region holds beside the week's chart: the
     column keeps the height it will have once the day has work in it, so the
     top row does not change shape at the first entry. */
  const PLACEHOLDER_ROWS = 3;

  return (
    <div className="flex flex-col">
      <RegionHead>Today · {dayLabel()}</RegionHead>

      <FigGroup tier="major" className="mt-6">
        <FigLabel>Earned</FigLabel>
        <PairLine>
          <Money
            figure="today-earned"
            amount={stats.earnedToday}
            currency={stats.currency}
            className="type-figure text-strong"
          />
          <span className="type-duration text-subtle">
            {formatCompact(seconds)}
          </span>
        </PairLine>
      </FigGroup>

      {/* A fixed ceiling rather than the panel's height: the page is a column
          sized by its content, so there is no bounded height to measure
          against. Just under five rows, so the cut-off row says it scrolls. */}
      <div className="mt-6 flex max-h-48 flex-col overflow-y-auto">
        {entries.length === 0
          ? /* An empty day keeps its rows rather than collapsing, the same way
               an unworked day in the week's chart keeps its caption: the
               em-dash is what holds the shape. Not a shimmer — nothing is
               loading by the time this renders, and a pulse would promise
               rows that are not coming. */
            Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
              <div
                key={`empty-${i}`}
                aria-hidden="true"
                data-entry-empty=""
                className="grid grid-cols-[9px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-edge-subtle py-2.5 first:border-t-0"
              >
                {/* No pip: the hollow ring means internal work, and three of
                    them would say the day held three untracked entries. An
                    empty column is what nothing looks like. */}
                <span />
                <span className="type-support text-subtle">—</span>
                <span className="type-duration text-subtle">—</span>
              </div>
            ))
          : tasks.map((t) => (
              <div
                key={t.key}
                data-task={t.key}
                className="grid grid-cols-[9px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-edge-subtle py-2.5 first:border-t-0"
              >
                {/* Only clients have a color; internal work takes the hollow
                  ring, which is what having none looks like on a screen
                  otherwise keyed by client. */}
                <Pip
                  color={t.projectId ? (colors.get(t.projectId) ?? null) : null}
                />
                <span
                  className={`type-support truncate ${
                    t.live ? 'text-primary' : 'text-muted'
                  }`}
                >
                  {t.name}
                  {t.projectName ? (
                    <span className="text-subtle"> · {t.projectName}</span>
                  ) : null}
                </span>
                <span className="type-duration text-subtle">
                  {clock(t.seconds)}
                </span>
              </div>
            ))}
      </div>
    </div>
  );
}

/**
 * One row per task: a name under two projects is two tasks. Entries arrive
 * newest first, so a task sits where its latest entry would.
 */
function groupByTask(entries: TimeEntry[], projects: Project[]) {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const tasks = new Map<
    string,
    {
      key: string;
      name: string;
      projectId: string | null;
      projectName: string | null;
      seconds: number;
      live: boolean;
    }
  >();
  for (const e of entries) {
    const name = e.taskName || 'Untitled';
    const key = `${e.projectId ?? ''}:${name}`;
    const t = tasks.get(key) ?? {
      key,
      name,
      projectId: e.projectId,
      projectName: e.projectId ? (names.get(e.projectId) ?? null) : null,
      seconds: 0,
      live: false,
    };
    t.seconds += secondsOf(e);
    t.live ||= e.endedAt === null;
    tasks.set(key, t);
  }
  return [...tasks.values()];
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

/** `4:15` — a task's length, beside `5h 00m` for the day's total. */
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
