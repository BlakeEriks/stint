'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutationState } from '@tanstack/react-query';
import {
  clickMinutes,
  drawnRange,
  formatCompact,
  formatLocalTime,
} from '@stint/core';
import { type } from '@stint/design-tokens';
import { placement, type PositionedEntry } from '@/lib/client/use-calendar';
import type { useEntryDrag, DragMode } from '@/lib/client/use-entry-drag';
import type { TimeEntry } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';

type DragApi = ReturnType<typeof useEntryDrag>;

const time = (at: Date | string) => formatLocalTime(at, tz);

/**
 * How tall the hover slot must be to show its label whole: one line of the
 * `meta` role at `leading-tight` (1.25), plus its 1px border top and bottom.
 * From the role's size, so a change to the scale moves it.
 */
const SLOT_LABEL_PX = Math.ceil(type.meta.size * 1.25) + 2;

/**
 * One day of entries, and where they get corrected: a block opens the editor,
 * dragging it or an end adjusts its times, and pressing on empty grid draws a
 * new entry, or a one-hour one where a click lands.
 *
 * `/calendar` draws seven of these and the dock's Today one, so the gestures
 * are the same wherever a day is drawn.
 */
export function DayColumn({
  positioned,
  colors,
  dayStart,
  dayEnd,
  gridlines,
  height,
  drag,
  onEdit,
  onCreate,
  children,
}: {
  positioned: PositionedEntry[];
  colors: Map<string, string | null>;
  /** The window the column draws — not necessarily the whole day. */
  dayStart: Date;
  dayEnd: Date;
  /** Where the gridlines fall, as percentages of the column. */
  gridlines: number[];
  height: number;
  drag: DragApi;
  onEdit: (entry: TimeEntry) => void;
  onCreate: (startedAt: Date, endedAt: Date) => void;
  /** Drawn over the entries, like the dock's now-line. */
  children?: ReactNode;
}) {
  const column = useRef<HTMLDivElement>(null);
  const pending = usePendingCreates();
  /* Once Save is pressed the prediction draws the entry, so the drawn
     outline steps aside for it rather than covering it. */
  const drawing =
    drag.preview?.entryId === null &&
    drag.preview.column === column.current &&
    !positioned.some((p) => pending.has(p.entry.id))
      ? drag.preview
      : null;
  /* The length a click makes here, and so the slot shown under the
     pointer: the shortest whose block fits its label at this zoom. */
  const hours = (dayEnd.getTime() - dayStart.getTime()) / 3_600_000;
  const minutes = clickMinutes(height / hours, SLOT_LABEL_PX);
  const hover = useHoverSlot(dayStart, dayEnd, minutes);

  return (
    /* The grid is a pointer SHORTCUT for picking a time, not the only way in:
       the calendar's day headings and the dock's Add carry real buttons, which
       are the keyboard path. A role here would be a lie — this element is the
       day's canvas and the blocks inside it are the controls.

       The gesture is owned here rather than on each block: a drag continues
       past the block's own edges, and pointer capture sends the events to
       whatever element started it, which is this or a block inside it. */
    <div
      ref={column}
      onPointerDown={(event) => {
        if (!column.current) return;
        drag.draw(event, column.current, dayStart, dayEnd, onCreate, minutes);
      }}
      onPointerMove={(event) => {
        drag.move(event);
        hover.move(event);
      }}
      onPointerLeave={hover.clear}
      onPointerUp={drag.end}
      onPointerCancel={drag.cancel}
      className="relative min-w-0 flex-1 border-l border-edge-subtle"
      style={{ height }}
    >
      {/* The gutter carries the hour; a gridline only needs its position. */}
      {gridlines.map((pct) => (
        <div
          key={pct}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-edge-grid"
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
          pending={pending.has(item.entry.id)}
        />
      ))}

      {hover.slot && !drawing && !drag.preview ? (
        <div
          aria-hidden
          data-hover-slot
          className="pointer-events-none absolute inset-x-0 overflow-hidden rounded-[5px] border border-dashed border-edge-subtle px-1.5 type-meta leading-tight text-subtle [@media(hover:none)]:hidden"
          style={edges(
            placement(
              hover.slot.startedAt,
              hover.slot.endedAt,
              dayStart,
              dayEnd,
            ),
          )}
        >
          {`+ ${time(hover.slot.startedAt)}`}
        </div>
      ) : null}

      {drawing ? (
        <div
          aria-hidden
          data-drawing
          className="pointer-events-none absolute inset-x-0 z-10 overflow-hidden rounded-[5px] border border-dashed border-edge-control bg-surface-hover px-1.5 py-0.5 shadow-card"
          style={edges(
            placement(drawing.startedAt, drawing.endedAt, dayStart, dayEnd),
          )}
        >
          <p className="truncate type-meta text-primary">
            {`${time(drawing.startedAt)}–${time(drawing.endedAt)}`}
          </p>
        </div>
      ) : null}

      {children}
    </div>
  );
}

/**
 * The block a click here would make, following a mouse over empty time:
 * its start snapped to the quarter hour, its length `minutes`. Not over an
 * entry or its grips (the event's target is then not the column), not while
 * a button is held, and not for touch, which has no hover to show it on.
 * It is the slot a press without travel draws, so the two always agree.
 */
function useHoverSlot(dayStart: Date, dayEnd: Date, minutes: number) {
  const [slot, setSlot] = useState<{ startedAt: Date; endedAt: Date } | null>(
    null,
  );
  const clear = () => setSlot(null);
  /* A scroll moves the grid under a still pointer, so the slot it showed
     could now sit over an entry. Captured at the window: a scroll does not
     bubble, and whichever scroller moved, the slot is stale. */
  const showing = slot !== null;
  useEffect(() => {
    if (!showing) return;
    const stale = () => setSlot(null);
    window.addEventListener('scroll', stale, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', stale, { capture: true });
  }, [showing]);
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const empty =
      event.pointerType === 'mouse' &&
      event.buttons === 0 &&
      event.target === event.currentTarget;
    if (!empty) return clear();
    const box = event.currentTarget.getBoundingClientRect();
    const at = (event.clientY - box.top) / box.height;
    const next = drawnRange(at, at, dayStart, dayEnd, minutes);
    setSlot((s) =>
      s?.startedAt.getTime() === next.startedAt.getTime() &&
      s.endedAt.getTime() === next.endedAt.getTime()
        ? s
        : next,
    );
  };
  return { slot, move, clear };
}

/**
 * Ids of entries being created, read from the mutation cache: a press that
 * sends a new entry's id and task, from the editor or the timer. Its block is
 * the prediction and the server has not answered yet.
 */
function usePendingCreates(): Set<string> {
  const ids = useMutationState({
    filters: { status: 'pending' },
    select: (m) => {
      const v = m.state.variables as { id?: unknown; taskName?: unknown };
      return typeof v?.id === 'string' && typeof v.taskName === 'string'
        ? v.id
        : null;
    },
  });
  return new Set(ids.filter((id): id is string => id !== null));
}

const edges = ({ top, height }: { top: number; height: number }) => ({
  top: `${top * 100}%`,
  height: `${height * 100}%`,
});

function EntryBlock({
  item,
  colors,
  dayStart,
  dayEnd,
  column,
  drag,
  onEdit,
  pending,
}: {
  item: PositionedEntry;
  colors: Map<string, string | null>;
  dayStart: Date;
  dayEnd: Date;
  column: React.RefObject<HTMLDivElement | null>;
  drag: DragApi;
  onEdit: (entry: TimeEntry) => void;
  /** Created and not yet answered: shown, faded like a dropped drag. */
  pending: boolean;
}) {
  const { entry } = item;
  const running = entry.endedAt === null;

  /* An entry billed on an issued invoice is frozen by a database trigger, so
     dragging it would 409 after the fact. Refusing the gesture is honest; the
     editor still opens and explains why. */
  const locked = entry.invoiceId != null;

  // While dragging, the block paints from the gesture rather than the server.
  const live = drag.preview?.entryId === entry.id ? drag.preview : null;
  const { height, range, style } = drawnAs(
    item,
    live,
    colors,
    dayStart,
    dayEnd,
  );
  const name = entry.taskName || 'Untitled';

  const body = (
    <span className="block h-full overflow-hidden">
      <span className="block truncate type-support leading-tight text-primary">
        {name}
      </span>{' '}
      {height > 0.045 ? (
        <span className="block truncate type-meta text-subtle">
          {/* During a drag the time range is what the user is aiming at, so it
              replaces the duration — the duration is what they already know. */}
          {live ? range : formatCompact(entry.durationSeconds ?? 0)}
        </span>
      ) : null}
    </span>
  );

  /* A running entry is not a button. `EntryDialog` refuses one by design —
     its end does not exist yet — and the timer bar owns retitling mid-run, so
     a click here would open a dialog that declines to edit what was clicked.
     Nor is a pending one: the server has no such entry to edit yet. */
  if (running || pending) {
    return (
      <div
        aria-busy={pending || undefined}
        className={blockClassName({ running, pending, live: false })}
        style={style}
      >
        {/* The times as text rather than an `aria-label`: a plain div takes
            no accessible name, and the roles that would carry one here
            (`group`, `img`) both describe something this is not. */}
        <span className="sr-only">{`${name}, ${range}${pending ? ', saving' : ''}`}</span>
        <div aria-hidden className="h-full">
          {body}
        </div>
      </div>
    );
  }

  const grab = (mode: DragMode) => (event: React.PointerEvent) => {
    if (locked || !column.current) return;
    drag.begin(event, entry, mode, column.current, dayStart, dayEnd);
  };

  return (
    <button
      type="button"
      title={`${name} · ${range}`}
      onPointerDown={grab('move')}
      onClick={(event) => {
        event.stopPropagation();
        // The pointer-up that ends a drag also fires a click. Opening the
        // editor on it would interrupt every adjustment with a dialog.
        if (drag.dragging()) return;
        onEdit(entry);
      }}
      className={blockClassName({
        running,
        adjustable: !locked,
        live: live !== null,
        saving: drag.saving,
      })}
      style={style}
    >
      <span className="sr-only">Edit</span> {body}
      {/* The visible text is a truncated name and a duration, so the times go
          in the accessible name or a screen reader cannot tell two apart. */}
      <span className="sr-only">{`${range}${locked ? ', billed' : ''}`}</span>
      {locked ? null : (
        <>
          <Handle edge="start" onPointerDown={grab('start')} />
          <Handle edge="end" onPointerDown={grab('end')} />
        </>
      )}
    </button>
  );
}

/** Where a block sits and the times it reads, from the drag while one is live. */
function drawnAs(
  item: PositionedEntry,
  live: { startedAt: Date; endedAt: Date } | null,
  colors: Map<string, string | null>,
  dayStart: Date,
  dayEnd: Date,
) {
  const { entry, lane, lanes } = item;
  const color = entry.projectId ? colors.get(entry.projectId) : undefined;
  const { top, height } = live
    ? placement(live.startedAt, live.endedAt, dayStart, dayEnd)
    : item;
  const startedAt = live?.startedAt ?? entry.startedAt;
  const endedAt = live?.endedAt ?? entry.endedAt;
  return {
    height,
    range: `${time(startedAt)}${endedAt ? `–${time(endedAt)}` : ' (running)'}`,
    style: {
      ...edges({ top, height }),
      left: `${(lane / lanes) * 100}%`,
      width: `${(1 / lanes) * 100}%`,
      // A client color reads as a left edge, so the block stays legible
      // rather than becoming a saturated tile behind text.
      borderLeft: color ? `2.5px solid ${color}` : undefined,
    },
  };
}

function blockClassName({
  running,
  pending = false,
  adjustable = false,
  live,
  saving = false,
}: {
  running: boolean;
  /** Created, and the server has not answered. */
  pending?: boolean;
  adjustable?: boolean;
  /** Being dragged right now. */
  live: boolean;
  saving?: boolean;
}) {
  return [
    /* No `overflow-hidden` here: the resize handles reach past the block's
       edges, and the body clips its own text instead. */
    'group/block absolute rounded-[5px] border px-1.5 py-0.5 text-left',
    'focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none',
    running && 'border-timer-running bg-accent-muted',
    !running && 'border-edge-subtle bg-surface-hover',
    !running && !pending && 'hover:bg-surface-active',
    !running && !pending && (adjustable ? 'cursor-grab' : 'cursor-pointer'),
    live && 'z-10 shadow-card',
    /* One look for any write the server hasn't answered: a dropped drag, or
       a new entry. */
    ((live && saving) || pending) && 'opacity-70',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The resize target on an edge of a block: 10px, seven of them past the edge,
 * so a 15-minute block keeps most of its height for the move and its two ends
 * never meet. A grip shows on hover, and always where there is no hover.
 *
 * `aria-hidden`, and deliberately not focusable: dragging is a pointer
 * affordance, and the keyboard path to the same change is the editor, which
 * has labeled time fields.
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
      className={`absolute inset-x-0 z-10 h-2.5 cursor-ns-resize ${
        edge === 'start' ? '-top-[7px]' : '-bottom-[7px]'
      }`}
    >
      <span
        className={`absolute left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-edge-control opacity-0 transition-opacity group-hover/block:opacity-100 [@media(hover:none)]:opacity-100 ${
          edge === 'start' ? 'top-[8px]' : 'bottom-[8px]'
        }`}
      />
    </span>
  );
}
