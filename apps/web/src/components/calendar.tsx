'use client';

import { useEffect, useRef } from 'react';
import { useDialog } from '@/lib/client/use-dialog';
import { useQuery } from '@tanstack/react-query';
import {
  formatCompact,
  formatClock,
  localDateKey,
  PX_PER_HOUR,
} from '@stint/core';
import { Button } from '@/components/ui/button';
import { useCalendar, type PositionedEntry } from '@/lib/client/use-calendar';
import {
  useAllProjects,
  useClientsQuery,
  useProjectClients,
} from '@/lib/client/use-project-colors';
import { useMediaQuery } from '@/lib/client/use-media-query';
import { useScrollerFocus, XL } from '@/lib/client/use-scroller-focus';
import { useEntryDrag } from '@/lib/client/use-entry-drag';
import { useZoom } from '@/lib/client/use-zoom';
import { api, type TimeEntry } from '@/lib/client/api';
import { Listing, Page, useLoaded } from './page';
import { EntryDialog, type Opens } from './entry-dialog';
import { KeyboardAdd } from './keyboard-add';
import { DayColumn, GUTTER_CLASS, gutterMarks, HourGutter } from './day-column';
import { keys } from '@stint/client';
import { timeZone as tz } from '@/lib/client/use-timer';

/** The least room between labeled gridlines: every 3 hours at the default
    scale, which reads cleanly at both column widths. */
const LABEL_GAP_PX = 3 * PX_PER_HOUR;

/**
 * The day view's cap alone, at the default scale: there the PAGE scrolls,
 * and a long window would otherwise render taller than the uncropped day it
 * crops. A week is 24 hours and overflows the panel on purpose, which is the
 * panel's scroll to carry.
 */
const DAY_MAX_HEIGHT = 620;

/**
 * A week of logged time, and where it gets corrected: seven `DayColumn`s,
 * zoomed by a pinch or a modified scroll over the grid.
 *
 * It visualizes what was tracked and does not schedule — the app's claim is
 * that the numbers on the invoice are the numbers you worked.
 */
export function Calendar() {
  /* One day on a phone. At 375px a week gives each day 42px, under the ~44px a
     finger needs; a single day gets ~295px. */
  const byDay = useMediaQuery('(max-width: 639px)');
  const scrollerFocus = useScrollerFocus();
  const cal = useCalendar(1, byDay);
  const { colorByProject, clientByProject } = useProjectClients();

  const projects = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });
  const clients = useClientsQuery();
  const allProjects = useAllProjects();
  /* The week as `Listing` reads a query. A week change keeps the last week
     on screen (`keepPreviousData`), so only the first load waits. */
  const week = {
    data: cal.loaded ? cal.days : undefined,
    error: cal.error,
    isLoading: cal.isLoading,
  };
  const loaded = [week, projects, clients, allProjects] as const;
  const ready = useLoaded(...loaded);

  const editor = useDialog<Opens>();

  const drag = useEntryDrag();

  /* The window every column draws. In week view it is the whole day; in day
     view the hook has cropped it to the worked hours. Columns share one
     window, so the gutter's labels line up with every column's gridlines. */
  const from = cal.days[0]?.from ?? cal.weekStart;
  const to = cal.days[0]?.to ?? cal.weekEnd;

  /* The zoom sets how tall an hour is, one level shared with the dock's
     Today; the window sets how many hours the grid holds. A week is 24 and
     can run taller than the panel, which the panel's scroller carries. At
     `xl` that scroller is the card's remaining height and zooming out stops
     where the day fills it; below `xl` the page scrolls, the grid sets its
     own height, and the day view keeps its cap. */
  const windowHours = (to.getTime() - from.getTime()) / 3_600_000;
  const xl = useMediaQuery(XL);
  const zoom = useZoom(windowHours, { fill: xl });
  const marks = gutterMarks(from, to, zoom.pxPerHour, LABEL_GAP_PX);
  const px = zoom.pxPerHour;
  const gridHeight = byDay
    ? Math.min(
        (DAY_MAX_HEIGHT * px) / PX_PER_HOUR,
        Math.round(windowHours * px),
      )
    : Math.round(windowHours * px);

  /* Keyed to the period on screen, not to the data: a refetch must not yank
     the grid back, and neither must a drag. It changes only when the arrows
     move — the day in day view, the week otherwise, matching what the
     columns redraw. */
  const period = byDay
    ? localDateKey(cal.cursor, tz)
    : localDateKey(cal.weekStart, tz);
  const scroller = useScrollToFirstEntry(period, cal.days, gridHeight, px);

  /* The heading names what is on screen, down to the day in day view. */
  const label = byDay
    ? new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: tz,
      }).format(cal.cursor)
    : new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: tz,
      }).format(cal.weekStart);

  const edit = (entry: TimeEntry) => editor.show({ existing: entry });

  /* Drawing on empty grid opens the editor pre-filled, rather than writing a
     row. A drag on a grid is a cheap gesture and a time entry is a financial
     record; pre-filling gets the time right without committing to it. */
  const create = (startedAt: Date, endedAt: Date) => {
    editor.show({
      seed: {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      },
    });
  };

  return (
    <Page flush fills workspace>
      {/* The screen is a column the height of the panel: the heading takes
          what it needs and the grid takes the rest. `min-h-0` at every link
          is what lets the grid shrink rather than push the column taller than
          the panel and hand the scroll back to the frame.

          It binds at `xl` for the same reason `fills` does — below it the
          column above owns the one gesture. */}
      <div className="flex min-h-0 flex-col xl:flex-1">
        {/* `flush`, so the regions below carry the panel's inset themselves
            rather than inheriting a second one from `Page`. */}
        <header className="flex flex-none flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            {/* `type-heading`, not `type-title`: the mono readout beside it is
              14px, and 24px over it reads as two unrelated sizes rather than
              a heading and its total. */}
            <h1 className="type-heading text-strong">{label}</h1>
            {/* The total matches the grid: this day on a phone, the week
              otherwise. */}
            {/* A figure, so it waits with the grid rather than reading
              0:00:00 first. */}
            {ready ? (
              <span className="type-duration text-muted">
                {formatClock(cal.visibleSeconds)}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            {/* The arrows step whatever unit is on screen, so "back" always
              means "the previous one of these". The labels say which. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={cal.prev}
              aria-label={byDay ? 'Previous day' : 'Previous week'}
            >
              ←
            </Button>
            <Button
              variant={cal.isCurrent ? 'default' : 'ghost'}
              size="sm"
              onClick={cal.today}
            >
              {byDay ? 'Today' : 'This week'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={cal.next}
              aria-label={byDay ? 'Next day' : 'Next week'}
            >
              →
            </Button>
          </div>
        </header>

        {/* The grid IS the panel, not a card on it — nothing inside the panel
          is a card. It is a column that can shrink, so it measures against
          the panel the frame gives this route rather than the window. The day
          headings are the column's first child and the scroller its second,
          which is what keeps the headings in place while the hours move under
          them.

          The rules above and below are region separators: edge to edge, they
          cut the panel into heading, grid and legend.

          At `xl` it takes the rest of the panel whatever the zoom, so the
          scroller's height is the room the day has to fill (`useZoom`), not
          the day's own height. */}
        {/* The grid paints once, with its entries already in their clients'
            colors. */}
        <Listing query={loaded}>
          {() => (
            <>
              <div className="flex min-h-0 flex-col overflow-hidden border-t border-edge-subtle xl:flex-1">
                <div className="flex flex-none border-b border-edge-subtle">
                  <div className={GUTTER_CLASS} />
                  {cal.days.map((day) => (
                    <DayHeading
                      key={day.date}
                      date={day.date}
                      at={day.at}
                      seconds={day.totalSeconds}
                      nameless={byDay}
                      /* 09:00, because a day added from the heading has no clicked
                   position to take a time from and the start of a working day is
                   the likeliest intent. */
                      onAdd={() => {
                        const start = new Date(
                          day.at.getTime() + 9 * 3_600_000,
                        );
                        create(start, new Date(start.getTime() + 3_600_000));
                      }}
                    />
                  ))}
                </div>

                {/* One scroll container so the hour gutter cannot drift from the grid.

              **It binds at `xl`, where `fills` gives the column the panel's
              height for it to measure against.** Below that the column is sized
              by its content, so an `overflow-y-auto` here would have nothing to
              resolve against: the grid would grow to its full 24 hours and the
              scroller outside it would carry the overflow — a scrollbar on a
              box with nothing to scroll, inside the one doing the work.

              So below `xl` there is no inner scroller and the page owns the
              scroll, which is one gesture however tall the chrome around it
              is. The day headings scroll with the hours there; they hold only
              where the scroller is inside the card. */}
                <div
                  ref={scroller}
                  tabIndex={scrollerFocus}
                  className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
                >
                  <div className="flex" ref={zoom.ref}>
                    <HourGutter marks={marks} height={gridHeight} />

                    {cal.days.map((day) => (
                      <DayColumn
                        key={day.date}
                        positioned={day.positioned}
                        colors={colorByProject}
                        /* The window the column DRAWS, which a cropped day view makes
                     narrower than the day itself. Positions are fractions of
                     this, so the inverse math a click or drag uses has to take
                     the same pair — passing the full day here would put every
                     new entry at the wrong time. */
                        dayStart={day.from}
                        dayEnd={day.to}
                        marks={marks}
                        height={gridHeight}
                        drag={drag}
                        onEdit={edit}
                        onCreate={create}
                      />
                    ))}
                  </div>
                </div>

                {/* Keyed to what is on screen — the day in day view, the week
              otherwise — so it never names a color that is not showing. */}
                <Legend days={cal.days} clientByProject={clientByProject} />
              </div>

              <CalendarStatus
                isError={cal.isError}
                visibleSeconds={cal.visibleSeconds}
                byDay={byDay}
              />
            </>
          )}
        </Listing>
      </div>

      {editor.subject ? (
        <EntryDialog
          {...editor.subject}
          open={editor.open}
          onOpenChange={(open) => {
            editor.onOpenChange(open);
            if (!open) drag.release();
          }}
          projects={projects.data?.projects ?? []}
        />
      ) : null}
    </Page>
  );
}

/**
 * Scrolls the grid to an hour above the earliest entry on screen, once per
 * `period`. Returns the ref for the scroll container.
 *
 * A week of ordinary days opens on the morning rather than on midnight, which
 * is what makes 24 hours affordable: the empty small hours are above the fold
 * instead of squeezing the worked ones.
 */
function useScrollToFirstEntry(
  period: string,
  days: { positioned: PositionedEntry[] }[],
  gridHeight: number,
  pxPerHour: number,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const landed = useRef<string>('');
  // A fraction of the window; Infinity when nothing is logged.
  const firstTop = Math.min(
    ...days.flatMap((d) => d.positioned.map((p) => p.top)),
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el || landed.current === period) return;
    /* Nothing logged: the window's own start is already the right place. */
    if (!Number.isFinite(firstTop)) return;
    landed.current = period;
    /* An hour above the first entry, so it does not sit against the top
       edge and the hour before it stays reachable without scrolling up. */
    el.scrollTop = Math.max(0, firstTop * gridHeight - pxPerHour);
  }, [period, firstTop, gridHeight, pxPerHour]);

  return scroller;
}

/** The line under the grid: a failed week, then emptiness. A rejected action
    is the mutation notice's to explain. */
function CalendarStatus({
  isError,
  visibleSeconds,
  byDay,
}: {
  isError: boolean;
  visibleSeconds: number;
  byDay: boolean;
}) {
  const muted = 'px-4 pt-3 type-support text-subtle sm:px-6';
  /* A later week that failed: the grid is still drawn and correct, it just
     has nothing in it. Neutral — a failed fetch is a condition, not a rejected
     action. */
  if (isError) {
    return <p className={muted}>Could not load these entries. Try again.</p>;
  }
  /* Says what is actually empty. "Nothing logged this week" over a single
     day's grid would be wrong whenever the rest of the week has hours in it. */
  if (visibleSeconds === 0) {
    return (
      <p className={muted}>
        Nothing logged {byDay ? 'this day' : 'this week'}. Draw or click a time
        to add an entry.
      </p>
    );
  }
  return null;
}

/**
 * Which client each color on the grid belongs to.
 *
 * **Built from the period in view, not from the client list**, so it never
 * names a color that is not on screen, and **ordered by tracked time**, which
 * is how much of the grid each color occupies.
 *
 * Every client with time is named — no long tail to merge — and internal work
 * appears only when present.
 */
function Legend({
  days,
  clientByProject,
}: {
  days: { positioned: PositionedEntry[] }[];
  clientByProject: Map<
    string,
    { id: string; name: string; color: string | null }
  >;
}) {
  const seconds = new Map<string, number>();
  const meta = new Map<string, { name: string; color: string | null }>();
  let internalSeconds = 0;

  for (const day of days) {
    for (const { entry } of day.positioned) {
      /* The entry's own duration, not the positioned block's height: a block
         is clipped to its day, so a long entry would otherwise be undercounted
         against the client it belongs to.

         A RUNNING entry has no duration yet (the column is generated from
         `ended_at`), so it contributes 0 to the ranking while still putting
         its client in the legend — the block is on the grid, so its color
         needs explaining regardless of how long it ends up being. */
      const secs = entry.durationSeconds ?? 0;
      const client = entry.projectId
        ? clientByProject.get(entry.projectId)
        : undefined;

      if (!client) {
        internalSeconds += secs;
        continue;
      }
      seconds.set(client.id, (seconds.get(client.id) ?? 0) + secs);
      meta.set(client.id, { name: client.name, color: client.color });
    }
  }

  const ranked = [...seconds.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 && internalSeconds === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-edge-subtle px-4 py-2.5">
      {ranked.map(([id]) => (
        <LegendItem
          key={id}
          color={meta.get(id)?.color ?? undefined}
          label={meta.get(id)?.name ?? 'Unknown client'}
        />
      ))}
      {internalSeconds > 0 ? <LegendItem label="No client" /> : null}
    </div>
  );
}

/**
 * `color` absent means work with no stripe on the grid: internal work, or a
 * client with no color.
 *
 * The swatch is then an outline rather than a fill — it shows what the absence
 * looks like instead of inventing a gray, which would read as a client of its
 * own. `use-project-colors.ts` refuses the same shared gray for the same
 * reason.
 */
function LegendItem({ color, label }: { color?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 type-support text-muted">
      <span
        aria-hidden
        className={`size-2 flex-none rounded-[2px] ${
          color ? '' : 'border border-edge-default'
        }`}
        style={color ? { backgroundColor: color } : undefined}
      />
      {label}
    </span>
  );
}

function DayHeading({
  date,
  at,
  seconds,
  onAdd,
  /** Day view: the `h1` already names this day, so the label would repeat it. */
  nameless = false,
}: {
  date: string;
  at: Date;
  seconds: number;
  onAdd: () => void;
  nameless?: boolean;
}) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: tz,
  }).format(at);
  const dayNum = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    timeZone: tz,
  }).format(at);

  const today = localDateKey(new Date(), tz) === date;

  const full = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  }).format(at);

  return (
    <div className="min-w-0 flex-1 px-1 py-2 text-center">
      {nameless ? null : (
        <>
          <div className="type-label text-subtle">{weekday}</div>
          {/* Today takes the heavier role as well as the stronger ink: one
              column out of seven has to be findable without reading. */}
          <div
            className={
              today ? 'type-heading text-strong' : 'type-body text-primary'
            }
          >
            {dayNum}
          </div>
        </>
      )}
      <div className="flex items-center justify-center gap-1">
        <span className="type-meta text-subtle">
          {seconds > 0 ? formatCompact(seconds) : '—'}
        </span>
        <KeyboardAdd label={`Add an entry on ${full}`} onClick={onAdd} />
      </div>
    </div>
  );
}
