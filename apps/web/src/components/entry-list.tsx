'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCompact, formatCurrency, startOfLocalDay } from '@stint/core';
import { CalendarDays, Plus } from 'lucide-react';
import { api, type Project, type TimeEntry } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { useProjectColors } from '@/lib/client/use-project-colors';
import { Button } from '@/components/ui/button';
import { EntryDialog } from './entry-dialog';
import { Listing } from './page';
import { TodayGrid } from './today-grid';
import { keys } from '@/lib/client/query-keys';

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
}) {
  const from = startOfLocalDay(new Date(), tz).toISOString();

  const query = useQuery({
    queryKey: keys.entries({ from }),
    queryFn: () => api.entries({ from }),
    /* Everything today, running included: a column without it has a hole
       at the one place the eye goes. */
    select: (r) => r.entries,
  });

  /* The foot totals outside the scroller, so it reads the day off the
     query rather than the render prop below. */
  const today = query.data ?? [];

  const colors = useProjectColors();

  /* `undefined` means "add", an entry means "edit". A separate boolean would
     let the two disagree about which is open. */
  const [editing, setEditing] = useState<TimeEntry | undefined>();
  const [open, setOpen] = useState(false);

  const openFor = (entry?: TimeEntry) => {
    setEditing(entry);
    setOpen(true);
  };

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
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={earnedToday === undefined ? 'ml-auto' : undefined}
          onClick={() => openFor()}
        >
          <Plus aria-hidden />
          Add
        </Button>
      </header>

      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller takes focus, or an empty day cannot be keyboard-scrolled. */}
      <div tabIndex={0} className="min-h-0 flex-1 overflow-y-auto">
        <Listing
          query={query}
          tight
          empty="Nothing logged yet today. Start a timer above."
        >
          {(entries) => (
            <TodayGrid entries={entries} colors={colors} onEdit={openFor} />
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

      <EntryDialog
        open={open}
        onOpenChange={setOpen}
        existing={editing}
        projects={projects}
      />
    </section>
  );
}
