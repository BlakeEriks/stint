'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatClock, formatCompact, startOfLocalDay } from '@stint/core';
import { Lock, Plus } from 'lucide-react';
import { api, type Project, type TimeEntry } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import {
  INTERNAL_SWATCH,
  useProjectColors,
} from '@/lib/client/use-project-colors';
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
  compact = false,
  grid = false,
  flush = false,
}: {
  projects: Project[];
  todaySeconds: number;
  /**
   * Three fields to a row — swatch, task, duration — for the 286px dock,
   * where six of them wrapped to three lines and made a glance a read. The
   * row still opens the editor, which is where the rest of an entry lives.
   */
  compact?: boolean;
  /**
   * Draw the day as a column instead of a list. Same entries, same editor —
   * it answers "where did the day go" rather than "what have I booked".
   */
  grid?: boolean;
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
    /* Everything today, running included. The two views disagree about the
       running entry — a list of durations would duplicate the timer bar,
       while a column without it has a hole at the one place the eye goes —
       so the filtering happens at render. A `select` that dropped it here
       would be one cache entry the two views fight over. */
    select: (r) => r.entries,
  });

  const byId = new Map(projects.map((p) => [p.id, p]));
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
      className={`${flush ? 'pt-1' : 'mt-6 border-t border-edge-subtle pt-4'} ${
        grid ? 'flex min-h-0 flex-1 flex-col' : ''
      }`}
      aria-label="Today's entries"
    >
      <header className="flex flex-none items-baseline justify-between gap-3 px-1 pb-2">
        <h2 className="type-label text-subtle">Today</h2>
        <span className="ml-auto type-duration text-muted">
          {formatClock(todaySeconds)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => openFor()}
        >
          <Plus aria-hidden />
          Add
        </Button>
      </header>

      <div className={grid ? 'min-h-0 flex-1 overflow-y-auto' : undefined}>
        <Listing
          query={query}
          tight
          empty="Nothing logged yet today. Start a timer above."
        >
          {(entries) =>
            grid ? (
              <TodayGrid entries={entries} colors={colors} onEdit={openFor} />
            ) : (
              <ul>
                {/* The running entry is in the timer bar already; a second
                    duration counting up beside it is the same fact twice. */}
                {entries
                  .filter((entry) => entry.endedAt !== null)
                  .map((entry) => (
                    <li key={entry.id}>
                      <Row
                        entry={entry}
                        project={byId.get(entry.projectId ?? '')}
                        color={colors.get(entry.projectId ?? '')}
                        compact={compact}
                        onEdit={() => openFor(entry)}
                      />
                    </li>
                  ))}
              </ul>
            )
          }
        </Listing>
      </div>

      <EntryDialog
        open={open}
        onOpenChange={setOpen}
        existing={editing}
        projects={projects}
      />
    </section>
  );
}

function Row({
  entry,
  project,
  color,
  compact = false,
  onEdit,
}: {
  entry: TimeEntry;
  project?: Project;
  /** The project's client's colour; absent for internal work. */
  color?: string | null;
  compact?: boolean;
  onEdit: () => void;
}) {
  const time = (iso: string) =>
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date(iso));

  const locked = entry.invoiceId != null;

  /* The whole row opens the editor — a row is the thing you mean to act on,
     and a dedicated pencil in a dense list is a small target hunting for a
     click. A billed entry still opens: it shows WHY it cannot be changed,
     which a disabled row would not.

     Sized by CONTAINER, not viewport: in a 286px dock on a 1440px window a
     `sm:` breakpoint is true and lays the row out as though there were room.

     The project and the time range WRAP to a second line rather than hide —
     both are billing-relevant, and in a list this short density is not the
     constraint. At `@md` they rejoin the first line, because one line per
     entry is what makes a wide list scannable. */
  const swatch = (
    <span
      aria-hidden
      className="size-1.5 flex-none rounded-[2px]"
      style={{ background: color ?? INTERNAL_SWATCH }}
    />
  );

  /* Three fields, one line, and the swatch LEADS: in a column this narrow the
     colour is what the eye sorts by, so it is the first thing on the row
     rather than a marker hanging off the project name. The project name, the
     badge, the lock and the range are all in the editor a click away. */
  if (compact) {
    return (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${entry.taskName || 'untitled entry'}`}
        className="flex w-full items-center gap-2 border-t border-edge-subtle px-1 py-2.5 text-left first:border-t-0 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
      >
        {swatch}
        <span className="min-w-0 flex-1 truncate type-control text-primary">
          {entry.taskName || <span className="text-subtle">Untitled</span>}
        </span>
        <span className="flex-none text-right type-duration text-primary">
          {formatCompact(entry.durationSeconds ?? 0)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit ${entry.taskName || 'untitled entry'}`}
      className="@container flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge-subtle px-1 py-2.5 text-left first:border-t-0 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none @md:flex-nowrap"
    >
      {/* `basis-full` claims the whole first line below `@md`, so the name is
          not squeezed to a few characters by the figures beside it — in a
          286px dock `flex-1` left it a few characters. At `@md` it shares
          the line. */}
      <span className="min-w-0 flex-1 basis-full truncate type-control text-primary @md:basis-auto">
        {entry.taskName || <span className="text-subtle">Untitled</span>}
      </span>

      {/* `order` pushes these two past the figure below `@md`, so they begin a
          line of their own; at `@md` the source order is the line. */}
      {project ? (
        <span className="order-2 flex flex-none items-center gap-1.5 type-meta text-muted @md:order-none">
          {swatch}
          {project.name}
        </span>
      ) : null}

      {!entry.isBillable ? (
        <span className="flex-none rounded border border-edge-default px-1.5 py-px type-badge text-subtle">
          Non-billable
        </span>
      ) : null}

      {/* Billed entries are frozen by a database trigger. Saying so in the
          row means the editor is never a surprise. */}
      {locked ? (
        <Lock
          aria-label="Billed on an issued invoice"
          className="size-3 flex-none text-subtle"
        />
      ) : null}

      <span className="order-2 flex-none type-meta text-subtle @md:order-none">
        {time(entry.startedAt)} – {entry.endedAt ? time(entry.endedAt) : '—'}
      </span>

      <span className="order-1 flex-none text-right type-duration text-primary @md:order-none @md:w-16">
        {formatCompact(entry.durationSeconds ?? 0)}
      </span>
    </button>
  );
}
