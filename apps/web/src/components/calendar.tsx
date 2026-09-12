'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCompact, formatClock, instantAt } from '@stint/core';
import { Button } from '@/components/ui/button';
import { useCalendar, type PositionedEntry } from '@/lib/client/use-calendar';
import { useProjectColors } from '@/lib/client/use-project-colors';
import {
  useEntryDrag,
  type Drag,
  type DragMode,
} from '@/lib/client/use-entry-drag';
import { Plus } from 'lucide-react';
import { api, type TimeEntry } from '@/lib/client/api';
import { Page } from './page';
import { EntryDialog } from './entry-dialog';

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

/**
 * A week of logged time.
 *
 * This visualises what was tracked; it does not schedule. There is no
 * "planned" layer and no external calendar — the app's claim is that the
 * numbers on the invoice are the numbers you worked.
 *
 * It is also where those numbers get corrected, because this is where a
 * mistracked block is noticed: a block opens the editor, dragging it adjusts
 * its times, and empty space starts a new entry at the time clicked.
 */
export function Calendar() {
  const cal = useCalendar();
  const colorByProject = useProjectColors();

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects(),
  });

  const [editing, setEditing] = useState<TimeEntry | undefined>();
  const [seed, setSeed] = useState<{ startedAt: string; endedAt: string }>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drag = useEntryDrag(setError);

  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: cal.tz,
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
    <Page wide>
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="type-title text-strong">{label}</h1>
          <span className="type-duration text-muted">
            {formatClock(cal.weekSeconds)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={cal.prev}
            aria-label="Previous week"
          >
            ←
          </Button>
          <Button
            variant={cal.offset === 0 ? 'secondary' : 'ghost'}
            size="sm"
            onClick={cal.today}
          >
            This week
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={cal.next}
            aria-label="Next week"
          >
            →
          </Button>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
        <div className="flex border-b border-edge-subtle">
          <div className="w-12 flex-none sm:w-14" />
          {cal.days.map((day) => (
            <DayHeading
              key={day.date}
              date={day.date}
              at={day.at}
              tz={cal.tz}
              seconds={day.totalSeconds}
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

        {/* One scroll container so the hour gutter cannot drift from the grid. */}
        <div className="max-h-[62vh] overflow-y-auto">
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
              style={{ height: GRID_HEIGHT }}
            >
              {HOURS.map((h) => (
                <span
                  key={h}
                  /* The label is a zero-height row anchored at the gridline,
                     so digits sit on the line at every position. `00` hangs
                     below its line instead of above it, or the scroll
                     container clips it. */
                  className={`absolute right-2 flex h-0 items-center type-meta leading-none text-subtle ${
                    h === 0 ? 'translate-y-1.5' : ''
                  }`}
                  style={{ top: `${(h / 24) * 100}%` }}
                >
                  {String(h).padStart(2, '0')}
                </span>
              ))}
            </div>

            {cal.days.map((day, i) => (
              <DayColumn
                key={day.date}
                positioned={day.positioned}
                colors={colorByProject}
                tz={cal.tz}
                dayStart={day.at}
                dayEnd={cal.days[i + 1]?.at ?? cal.weekEnd}
                drag={drag}
                onEdit={edit}
                onCreate={create}
              />
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 type-support text-danger">
          {error}
        </p>
      ) : cal.isLoading ? (
        <p className="mt-3 type-support text-subtle">Loading…</p>
      ) : cal.weekSeconds === 0 ? (
        <p className="mt-3 type-support text-subtle">
          Nothing logged this week. Click a time to add an entry.
        </p>
      ) : null}

      <EntryDialog
        open={open}
        onOpenChange={setOpen}
        existing={editing}
        seed={seed}
        projects={projects.data?.projects ?? []}
        tz={cal.tz}
      />
    </Page>
  );
}

/** Fixed pixel height so an hour is the same size on every screen. */
const GRID_HEIGHT = 720;

function DayHeading({
  date,
  at,
  tz,
  seconds,
  onAdd,
}: {
  date: string;
  at: Date;
  tz: string;
  seconds: number;
  onAdd: () => void;
}) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: tz,
  }).format(at);
  const dayNum = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    timeZone: tz,
  }).format(at);

  const today =
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()) ===
    date;

  const full = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  }).format(at);

  return (
    <div className="group min-w-0 flex-1 px-1 py-2 text-center">
      <div className="type-label text-subtle">{weekday}</div>
      <div
        className={`type-body ${today ? 'font-semibold text-strong' : 'text-primary'}`}
      >
        {dayNum}
      </div>
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
  tz,
  dayStart,
  dayEnd,
  drag,
  onEdit,
  onCreate,
}: {
  positioned: PositionedEntry[];
  colors: Map<string, string | null>;
  tz: string;
  dayStart: Date;
  dayEnd: Date;
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
      style={{ height: GRID_HEIGHT }}
    >
      {HOURS.map((h) => (
        <div
          key={h}
          aria-hidden
          className="absolute inset-x-0 border-t border-edge-subtle/60"
          style={{ top: `${(h / 24) * 100}%` }}
        />
      ))}

      {positioned.map((item) => (
        <EntryBlock
          key={item.entry.id}
          item={item}
          colors={colors}
          tz={tz}
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
  tz,
  dayStart,
  dayEnd,
  column,
  drag,
  onEdit,
}: {
  item: PositionedEntry;
  colors: Map<string, string | null>;
  tz: string;
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
