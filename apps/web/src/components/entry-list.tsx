'use client';

import { useDialog } from '@/lib/client/use-dialog';
import { useQuery } from '@tanstack/react-query';
import {
  formatCompact,
  formatCurrency,
  SNAP_MINUTES,
  startOfLocalDay,
} from '@stint/core';
import { CalendarDays } from 'lucide-react';
import { api, type Project } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { useProjectColors } from '@/lib/client/use-project-colors';
import { useScrollerFocus } from '@/lib/client/use-scroller-focus';
import { useEntryDrag } from '@/lib/client/use-entry-drag';
import { EntryDialog, type Opens } from './entry-dialog';
import { KeyboardAdd } from './keyboard-add';
import { Listing } from './page';
import { TodayGrid } from './today-grid';
import { keys } from '@stint/client';

/**
 * Today's entries, in the dock beneath the inbox and subordinate to it. An
 * inbox row is there to be acted on; a passive list drawing the same attention
 * is how the inbox stops being read. So Today is quieter — a hairline above
 * it, and no surface of its own.
 */
export function EntryList({
  projects,
  todaySeconds,
  earnedToday,
  currency = 'USD',
  flush = false,
  fills = false,
}: {
  projects: Project[];
  todaySeconds: number;
  /**
   * What the day's work is worth, from `/stats`.
   *
   * Undefined where the caller has no stats to hand, which is what keeps the
   * header from printing `$0.00` over a figure that is merely not loaded yet.
   * `0` is a real answer and renders as one.
   */
  earnedToday?: number;
  currency?: string;
  /**
   * Drop the top rule and the space above it, because something else is
   * already drawing the divider — the dock's drag handle, which IS the rule
   * between the two regions. Two would read as a boxed region.
   */
  flush?: boolean;
  /** The dock's fixed column at `xl`, which Today's day fills. */
  fills?: boolean;
}) {
  const query = useDayEntries();

  /* The foot totals outside the scroller, so it reads the day off the
     query rather than the render prop below. */
  const today = query.data ?? [];

  const colors = useProjectColors();

  /* An entry edits it; otherwise it adds one, at the times drawn if any. */
  const drag = useEntryDrag();
  const editing = useDialog<Opens>();

  return (
    <section
      /* In the dock this takes half the column and scrolls inside it, the
         inbox above taking the other half. `min-h-0` is what lets it shrink
         below its content so the grid scrolls rather than the column growing;
         `basis-1/2` is the floor that stops a long inbox crushing it. It
         still grows past half when the inbox wants less. */
      className={`flex min-h-0 flex-1 flex-col ${
        flush ? 'pt-1' : 'mt-6 border-t border-edge-subtle pt-4'
      }`}
      aria-label="Today's entries"
    >
      {/* The head answers what the day was worth; the foot totals what it
          took. A region's figure sits beside its title everywhere else on the
          screen, and the hours belong under the column that adds up to them.

          `items-center` rather than `items-baseline`, because the icon has no
          baseline to share and hung low beside the title without it. */}
      <header className="flex flex-none items-center gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <CalendarDays
            aria-hidden
            strokeWidth={1.75}
            className="size-3.5 flex-none text-subtle"
          />
          <h2 className="type-label truncate text-subtle">Today</h2>
        </div>
        {/* Undefined while stats are still in flight: a `$0.00` that resolves
            to a real figure a moment later reports a day that earned nothing
            and then took it back. */}
        {earnedToday === undefined ? null : (
          <span className="ml-auto type-duration text-primary">
            {formatCurrency(earnedToday, currency)}
          </span>
        )}
        <KeyboardAdd
          label="Add an entry today"
          className={earnedToday === undefined ? 'ml-auto' : ''}
          onClick={() => editing.show({ seed: lastHour(new Date()) })}
        />
      </header>

      <div
        tabIndex={useScrollerFocus()}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {/* No `empty`: a day with nothing logged still draws its grid, the
            only place a pointer adds an entry. */}
        <Listing query={query} tight>
          {(entries) => (
            <>
              {entries.length === 0 ? (
                <p className="px-1 pb-2 type-support text-subtle">
                  Nothing logged yet today. Draw or click a time, or start a
                  timer above.
                </p>
              ) : null}
              <TodayGrid
                entries={entries}
                colors={colors}
                drag={drag}
                fills={fills}
                onEdit={(existing) => editing.show({ existing })}
                onCreate={(startedAt, endedAt) =>
                  editing.show({
                    seed: {
                      startedAt: startedAt.toISOString(),
                      endedAt: endedAt.toISOString(),
                    },
                  })
                }
              />
            </>
          )}
        </Listing>
      </div>

      {/* OUTSIDE the scroller, so the total stays put while the day scrolls
          past it — a sum that scrolls away is a sum you have to go looking
          for. `flex-none` keeps it out of the height the grid divides.

          A column of hours ending in its own sum reads without a label, which
          is what lets the header spend its one slot on the money. */}
      {today.length > 0 ? (
        <div className="flex flex-none items-baseline gap-2 border-t border-edge-grid px-1 pt-1.5">
          <span className="type-meta text-subtle">
            {today.length} {today.length === 1 ? 'entry' : 'entries'}
          </span>
          <span className="ml-auto type-duration text-muted">
            {formatCompact(todaySeconds)}
          </span>
        </div>
      ) : null}

      {editing.subject ? (
        <EntryDialog
          {...editing.subject}
          open={editing.open}
          onOpenChange={(open) => {
            editing.onOpenChange(open);
            if (!open) drag.release();
          }}
          projects={projects}
        />
      ) : null}
    </section>
  );
}

/**
 * The hour up to the last quarter hour: what Add opens on. Work is logged
 * after it is done, and an end in the future would be a guess.
 */
function lastHour(now: Date) {
  const dayStart = startOfLocalDay(now, tz).getTime();
  const step = SNAP_MINUTES * 60_000;
  const end = dayStart + Math.floor((now.getTime() - dayStart) / step) * step;
  return {
    startedAt: new Date(end - 3_600_000).toISOString(),
    endedAt: new Date(end).toISOString(),
  };
}

/**
 * Everything today, running included: a column without it has a hole at the
 * one place the eye goes. A hook of its own so the dock can gate on the same
 * query the list reads.
 */
export function useDayEntries() {
  const from = startOfLocalDay(new Date(), tz).toISOString();
  return useQuery({
    queryKey: keys.entries({ from }),
    queryFn: () => api.entries({ from }),
    select: (r) => r.entries,
  });
}
