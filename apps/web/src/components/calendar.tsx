'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  formatCompact,
  formatClock,
  instantAt,
  localDateKey,
} from '@stint/core';
import { Button } from '@/components/ui/button';
import { useCalendar, type PositionedEntry } from '@/lib/client/use-calendar';
import { useProjectClients } from '@/lib/client/use-project-colors';
import { useMediaQuery } from '@/lib/client/use-media-query';
import {
  useEntryDrag,
  type Drag,
  type DragMode,
} from '@/lib/client/use-entry-drag';
import { Plus } from 'lucide-react';
import { api, type TimeEntry } from '@/lib/client/api';
import { Page } from './page';
import { EntryDialog } from './entry-dialog';
import { keys } from '@/lib/client/query-keys';
import { timeZone as tz } from '@/lib/client/use-timer';

/** Hours between gridlines. Every 3 reads cleanly at both column widths. */
const HOUR_STEP = 3;

/**
 * Pixels per hour in the cropped day view, and the ceiling it obeys. 44px
 * keeps a 30-minute entry at the touch target; the cap is what keeps a long
 * window from rendering taller than the uncropped day it crops.
 */
const PX_PER_HOUR = 44;
const DAY_MAX_HEIGHT = 620;

/**
 * The gridlines for a column spanning `from`–`to`, as percentages of it.
 *
 * Marks fall on multiples of `HOUR_STEP` in local wall-clock terms, so a
 * cropped window starting at 06:00 shows 06, 09, 12 rather than an offset
 * sequence counted from the window's own start.
 */
function hourMarks(from: Date, to: Date): { hour: number; pct: number }[] {
  const span = to.getTime() - from.getTime();
  const startHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(from),
  );

  const marks: { hour: number; pct: number }[] = [];
  const first = Math.ceil(startHour / HOUR_STEP) * HOUR_STEP;
  /* Stepping by elapsed hours from the window's start: a DST day is 23 or 25
     hours long, so a wall-clock hour is not always 3600s of the column. */
  for (let h = first; ; h += HOUR_STEP) {
    const at = from.getTime() + (h - startHour) * 3_600_000;
    const pct = ((at - from.getTime()) / span) * 100;
    if (pct > 100) break;
    /* A full-day window ends on hour 24, which `% 24` turns back into 0 — the
       same React key as the midnight at the top, and two children with one
       key. Keyed by `pct` instead, which is unique by construction. */
    marks.push({ hour: h % 24, pct });
  }
  return marks;
}

/**
 * A week of logged time, and where it gets corrected: a block opens the
 * editor, dragging it adjusts its times, empty space starts a new entry at the
 * time clicked.
 *
 * It visualises what was tracked and does not schedule — the app's claim is
 * that the numbers on the invoice are the numbers you worked.
 */
export function Calendar() {
  /* One day on a phone. At 375px a week gives each day 42px, under the ~44px a
     finger needs; a single day gets ~295px. */
  const byDay = useMediaQuery('(max-width: 639px)');
  const cal = useCalendar(1, byDay);
  const { colorByProject, clientByProject } = useProjectClients();

  const projects = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });

  const [editing, setEditing] = useState<TimeEntry | undefined>();
  const [seed, setSeed] = useState<{ startedAt: string; endedAt: string }>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drag = useEntryDrag(setError);

  /* The window every column draws. In week view it is the whole day; in day
     view the hook has cropped it to the worked hours. Columns share one
     window, so the gutter's labels line up with every column's gridlines. */
  const from = cal.days[0]?.from ?? cal.weekStart;
  const to = cal.days[0]?.to ?? cal.weekEnd;
  const marks = hourMarks(from, to);

  /* Fixed height in week view, so an hour is the same size on every screen. In
     day view the height follows the window and the page scrolls, so a shorter
     day is a shorter page. */
  const gridHeight = byDay
    ? Math.min(
        DAY_MAX_HEIGHT,
        Math.round(((to.getTime() - from.getTime()) / 3_600_000) * PX_PER_HOUR),
      )
    : GRID_HEIGHT;

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

  const edit = (entry: TimeEntry) => {
    setError(null);
    setSeed(undefined);
    setEditing(entry);
    setOpen(true);
  };

  /* Clicking empty grid opens the editor pre-filled, rather than writing a
     row. A click on a grid is a cheap gesture and a time entry is a financial
     record; pre-filling gets the time right without committing to it. */
  const create = (startedAt: Date, endedAt: Date) => {
    setError(null);
    setEditing(undefined);
    setSeed({
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    });
    setOpen(true);
  };

  return (
    <Page wide fills>
      {/* The screen is a column the height of the panel: the heading takes
          what it needs and the grid takes the rest. `min-h-0` at every link
          is what lets the grid shrink rather than push the column taller than
          the panel and hand the scroll back to the frame.

          It binds at `xl` for the same reason `fills` does — below it the
          column above owns the one gesture. */}
      <div className="flex min-h-0 flex-col xl:flex-1">
        <header className="flex flex-none flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex items-baseline gap-3">
            <h1 className="type-title text-strong">{label}</h1>
            {/* The total matches the grid: this day on a phone, the week
              otherwise. */}
            <span className="type-duration text-muted">
              {formatClock(cal.visibleSeconds)}
            </span>
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

        {/* The card is a column that can shrink, so the grid inside it measures
          against the panel the frame gives this route rather than the window.
          The day headings are the column's first child and the scroller its
          second, which is what keeps the headings in place while the hours
          move under them. */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
          <div className="flex flex-none border-b border-edge-subtle">
            <div className="w-12 flex-none sm:w-14" />
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
                  const start = new Date(day.at.getTime() + 9 * 3_600_000);
                  create(start, new Date(start.getTime() + 3_600_000));
                }}
              />
            ))}
          </div>

          {/* One scroll container so the hour gutter cannot drift from the grid.

            **On a phone there is no inner scroller at all** — the page owns
            the scroll, so there is one gesture however tall the chrome around
            it is. The cropped window is what keeps that honest. */}
          <div className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
            <div
              className="flex"
              /* The gesture is owned here rather than on each block: a drag
               continues past the block's own edges, and pointer capture sends
               the events to whatever element started it. */
              onPointerMove={drag.move}
              onPointerUp={drag.end}
              onPointerCancel={drag.cancel}
            >
              <div
                className="relative w-12 flex-none sm:w-14"
                style={{ height: gridHeight }}
              >
                {marks.map(({ hour, pct }) => (
                  <span
                    key={pct}
                    /* The label is a zero-height row anchored at the gridline,
                     so digits sit on the line at every position. The first
                     mark hangs below its line instead of above it, or the
                     container clips it. */
                    className={`absolute right-2 flex h-0 items-center type-meta leading-none text-subtle ${
                      pct === 0 ? 'translate-y-1.5' : ''
                    }`}
                    style={{ top: `${pct}%` }}
                  >
                    {String(hour).padStart(2, '0')}
                  </span>
                ))}
              </div>

              {cal.days.map((day) => (
                <DayColumn
                  key={day.date}
                  positioned={day.positioned}
                  colors={colorByProject}
                  /* The window the column DRAWS, which a cropped day view makes
                   narrower than the day itself. Positions are fractions of
                   this, so the inverse maths a click or drag uses has to take
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
            otherwise — so it never names a colour that is not showing. */}
          <Legend days={cal.days} clientByProject={clientByProject} />
        </div>

        {error ? (
          <p role="alert" className="mt-3 type-support text-danger">
            {error}
          </p>
        ) : cal.isLoading ? (
          <p className="mt-3 type-support text-subtle">Loading…</p>
        ) : cal.isError ? (
          /* Neutral: the grid is still drawn and correct, it just has nothing
           in it — a failed fetch is a condition, not a rejected action. */
          <p className="mt-3 type-support text-subtle">
            Could not load these entries. Try again.
          </p>
        ) : cal.visibleSeconds === 0 ? (
          /* Says what is actually empty. "Nothing logged this week" over a
           single day's grid would be wrong whenever the rest of the week has
           hours in it. */
          <p className="mt-3 type-support text-subtle">
            Nothing logged {byDay ? 'this day' : 'this week'}. Click a time to
            add an entry.
          </p>
        ) : null}
      </div>

      <EntryDialog
        open={open}
        onOpenChange={setOpen}
        existing={editing}
        seed={seed}
        projects={projects.data?.projects ?? []}
      />
    </Page>
  );
}

/** Fixed pixel height so an hour is the same size on every screen. */
const GRID_HEIGHT = 720;

/**
 * Which client each colour on the grid belongs to.
 *
 * **Built from the period in view, not from the client list**, so it never
 * names a colour that is not on screen, and **ordered by tracked time**, which
 * is how much of the grid each colour occupies.
 *
 * Every client with time is named — no long tail to merge — and internal work
 * appears only when present.
 */
function Legend({
  days,
  clientByProject,
}: {
  days: { positioned: PositionedEntry[] }[];
  clientByProject: Map<string, { id: string; name: string; color: string }>;
}) {
  const seconds = new Map<string, number>();
  const meta = new Map<string, { name: string; color: string }>();
  let internalSeconds = 0;

  for (const day of days) {
    for (const { entry } of day.positioned) {
      /* The entry's own duration, not the positioned block's height: a block
         is clipped to its day, so a long entry would otherwise be undercounted
         against the client it belongs to.

         A RUNNING entry has no duration yet (the column is generated from
         `ended_at`), so it contributes 0 to the ranking while still putting
         its client in the legend — the block is on the grid, so its colour
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
          colour={meta.get(id)?.color}
          label={meta.get(id)?.name ?? 'Unknown client'}
        />
      ))}
      {internalSeconds > 0 ? <LegendItem label="No client" /> : null}
    </div>
  );
}

/**
 * `colour` absent means internal work, which carries no stripe on the grid.
 *
 * The swatch is then an outline rather than a fill — it shows what the absence
 * looks like instead of inventing a grey, which would read as a client of its
 * own. `use-project-colors.ts` refuses the same shared grey for the same
 * reason.
 */
function LegendItem({ colour, label }: { colour?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 type-support text-muted">
      <span
        aria-hidden
        className={`size-2 flex-none rounded-[2px] ${
          colour ? '' : 'border border-edge-default'
        }`}
        style={colour ? { backgroundColor: colour } : undefined}
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
    <div className="group min-w-0 flex-1 px-1 py-2 text-center">
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
        {/* The keyboard path to adding an entry, and the discoverable one:
            clicking a time in the grid is faster but invisible until tried.
            Always in the DOM so it is tabbable; shown on hover or focus so
            seven of them do not compete with the durations. */}
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add an entry on ${full}`}
          className="rounded-sm px-0.5 text-subtle opacity-0 transition-opacity
                     hover:text-primary focus-visible:opacity-100
                     focus-visible:ring-2 focus-visible:ring-edge-focus
                     focus-visible:outline-none group-hover:opacity-100"
        >
          <Plus aria-hidden className="size-3" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

type DragApi = ReturnType<typeof useEntryDrag>;

function DayColumn({
  positioned,
  colors,
  dayStart,
  dayEnd,
  marks,
  height,
  drag,
  onEdit,
  onCreate,
}: {
  positioned: PositionedEntry[];
  colors: Map<string, string | null>;
  /** The window the column draws — not necessarily the whole day. */
  dayStart: Date;
  dayEnd: Date;
  marks: { hour: number; pct: number }[];
  height: number;
  drag: DragApi;
  onEdit: (entry: TimeEntry) => void;
  onCreate: (startedAt: Date, endedAt: Date) => void;
}) {
  const column = useRef<HTMLDivElement>(null);

  /* A click on empty grid seeds a one-hour entry at the time clicked. One hour
     because it is the most common block and is immediately visible; the dialog
     is open on top of it, so the duration is one edit away. */
  const onBackgroundClick = (event: React.MouseEvent) => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    const start = instantAt(
      (event.clientY - box.top) / box.height,
      dayStart,
      dayEnd,
    );
    onCreate(start, new Date(start.getTime() + 3_600_000));
  };

  return (
    /* The grid is a pointer SHORTCUT for picking a time, not the only way in:
       each day heading carries a real button, which is the keyboard path. A
       role here would be a lie — this element is the day's canvas and the
       blocks inside it are the controls — and a keydown on a 720px-tall div
       with no focus affordance would be worse than the button that exists. */
    // biome-ignore-start lint/a11y/noStaticElementInteractions: see above
    // biome-ignore-start lint/a11y/useKeyWithClickEvents: see above
    <div
      ref={column}
      onClick={onBackgroundClick}
      className="relative min-w-0 flex-1 border-l border-edge-subtle"
      style={{ height }}
    >
      {/* The gutter carries the hour; a gridline only needs its position. */}
      {marks.map(({ pct }) => (
        <div
          key={pct}
          aria-hidden
          className="absolute inset-x-0 border-t border-edge-subtle/60"
          style={{ top: `${pct}%` }}
        />
      ))}

      {positioned.map((item) => (
        <EntryBlock
          key={item.entry.id}
          item={item}
          colors={colors}
          dayStart={dayStart}
          dayEnd={dayEnd}
          column={column}
          drag={drag}
          onEdit={onEdit}
        />
      ))}
    </div>
    // biome-ignore-end lint/a11y/noStaticElementInteractions: see above
    // biome-ignore-end lint/a11y/useKeyWithClickEvents: see above
  );
}

function EntryBlock({
  item,
  colors,
  dayStart,
  dayEnd,
  column,
  drag,
  onEdit,
}: {
  item: PositionedEntry;
  colors: Map<string, string | null>;
  dayStart: Date;
  dayEnd: Date;
  column: React.RefObject<HTMLDivElement | null>;
  drag: DragApi;
  onEdit: (entry: TimeEntry) => void;
}) {
  const { entry, lane, lanes } = item;
  const color = entry.projectId ? colors.get(entry.projectId) : undefined;
  const running = entry.endedAt === null;

  /* An entry billed on an issued invoice is frozen by a database trigger, so
     dragging it would 409 after the fact. Refusing the gesture is honest; the
     editor still opens and explains why. */
  const locked = entry.invoiceId != null;
  const adjustable = !running && !locked;

  // While dragging, the block paints from the gesture rather than the server.
  const live = drag.preview?.entryId === entry.id ? drag.preview : null;
  const { top, height } = live
    ? span(live, dayStart, dayEnd)
    : { top: item.top, height: item.height };

  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    }).format(new Date(iso));

  const startedAt = live ? live.startedAt.toISOString() : entry.startedAt;
  const endedAt = live ? live.endedAt.toISOString() : entry.endedAt;
  const name = entry.taskName || 'Untitled';

  const range = `${time(startedAt)}${
    endedAt ? `–${time(endedAt)}` : ' (running)'
  }`;

  const grab = (mode: DragMode) => (event: React.PointerEvent) => {
    if (!adjustable || !column.current) return;
    drag.begin(event, entry, mode, column.current, dayStart, dayEnd);
  };

  return (
    <button
      type="button"
      /* The accessible name carries the times, because the block's visible
         text is a truncated task name and a duration — a screen reader
         otherwise gets no way to tell two blocks apart. */
      aria-label={`${name}, ${range}${locked ? ', billed' : ''}`}
      title={`${name} · ${range}`}
      onPointerDown={grab('move')}
      onClick={(event) => {
        event.stopPropagation();
        // The pointer-up that ends a drag also fires a click. Opening the
        // editor on it would interrupt every adjustment with a dialog.
        if (drag.dragging()) return;
        onEdit(entry);
      }}
      className={`absolute overflow-hidden rounded-[5px] border px-1.5 py-0.5 text-left
                  focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none ${
                    running
                      ? 'border-accent-default bg-accent-muted'
                      : 'border-edge-subtle bg-surface-hover'
                  } ${adjustable ? 'cursor-grab' : 'cursor-pointer'} ${
                    live ? 'z-10 shadow-card' : ''
                  } ${drag.saving && live ? 'opacity-70' : ''}`}
      style={{
        top: `${top * 100}%`,
        height: `${height * 100}%`,
        left: `${(lane / lanes) * 100}%`,
        width: `${(1 / lanes) * 100}%`,
        // A client colour reads as a left edge, so the block stays legible
        // rather than becoming a saturated tile behind text.
        borderLeft: color ? `2.5px solid ${color}` : undefined,
      }}
    >
      <p className="truncate type-support leading-tight text-primary">{name}</p>
      {height > 0.045 ? (
        <p className="truncate type-meta text-subtle">
          {/* During a drag the time range is what the user is aiming at, so it
              replaces the duration — the duration is what they already know. */}
          {live ? range : formatCompact(entry.durationSeconds ?? 0)}
        </p>
      ) : null}

      {adjustable ? (
        <>
          <Handle edge="start" onPointerDown={grab('start')} />
          <Handle edge="end" onPointerDown={grab('end')} />
        </>
      ) : null}
    </button>
  );
}

/**
 * The resize target on an edge of a block.
 *
 * `aria-hidden`, and deliberately not focusable: dragging is a pointer
 * affordance, and the keyboard path to the same change is the editor, which
 * has labelled time fields rather than an invisible 6px strip.
 */
function Handle({
  edge,
  onPointerDown,
}: {
  edge: 'start' | 'end';
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  return (
    <span
      aria-hidden
      onPointerDown={onPointerDown}
      className={`absolute inset-x-0 h-1.5 cursor-ns-resize ${
        edge === 'start' ? 'top-0' : 'bottom-0'
      }`}
    />
  );
}

/** Where a dragged entry sits in its column, as fractions. */
function span(drag: Drag, dayStart: Date, dayEnd: Date) {
  const total = dayEnd.getTime() - dayStart.getTime();
  const top = (drag.startedAt.getTime() - dayStart.getTime()) / total;
  const height = (drag.endedAt.getTime() - drag.startedAt.getTime()) / total;
  return {
    top: Math.max(0, Math.min(1, top)),
    height: Math.max(0.012, Math.min(height, 1 - top)),
  };
}
