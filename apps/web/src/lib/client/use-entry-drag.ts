'use client';

import { useRef, useState } from 'react';
import {
  drawnRange,
  instantAt,
  movedByDays,
  movedTo,
  resized,
  DRAG_THRESHOLD_PX,
} from '@stint/core';
import { api, type TimeEntry } from './api';
import {
  invalidateEntryData,
  keys,
  useOptimisticMutation,
} from '@stint/client';
import { timeZone as tz } from './use-timer';

// A block is fixed where the mistake is noticed, so the gesture that writes is
// made deliberate rather than removed: a threshold and a snap, and a move never
// re-derives a value it was only asked to move.

/** What the pointer is doing to a block. */
export type DragMode = 'move' | 'start' | 'end';

/** A drag in progress, for the block to paint itself from. */
export interface Drag {
  /** Null while drawing a new entry on empty grid. */
  entryId: string | null;
  /** The entry being moved, for a column it lands in to draw. */
  entry: TimeEntry | null;
  /** The column: pixels resolve against it, and only it paints a draw. */
  column: HTMLElement;
  startedAt: Date;
  endedAt: Date;
}

type Drawn = (startedAt: Date, endedAt: Date) => void;

interface Active extends Drag {
  mode: DragMode | 'draw';
  /** What a draw hands its range to. Nothing is written until it saves. */
  onDrawn?: Drawn;
  /** How long a press without travel makes the entry (`clickMinutes`). */
  clickMinutes?: number;
  dayStart: Date;
  dayEnd: Date;
  /** The columns side by side, a day each: a move lands in any of them. */
  columns: HTMLElement[];
  originX: number;
  originY: number;
  /** Original times, so a drag is computed from them rather than compounding. */
  fromStart: Date;
  fromEnd: Date;
  moved: boolean;
}

/**
 * Adjusting an entry by dragging its block, and drawing a new one on empty
 * grid (`draw`), which hands its range to the editor rather than writing.
 *
 * The gesture only commits on release, and only if the pointer actually
 * traveled — `DRAG_THRESHOLD_PX`. That matters more here than in most drag
 * implementations: a block is also the control that opens the editor, so
 * without a threshold every click would land a PATCH that rewrites billable
 * time by whatever a 1px tremor resolved to.
 *
 * A move also goes sideways, to the day under the pointer, keeping its wall
 * clock (`movedByDays`); its time still resolves against the column it left,
 * whose own span is what makes the vertical math DST-correct. A resize stays
 * in its column.
 */
export function useEntryDrag() {
  const active = useRef<Active | null>(null);
  /* A completed drag, kept until the click it produces has been suppressed.
     Asking whether a drag is IN PROGRESS cannot work: the pointer-up that ends
     the gesture clears it, and the click fires after that — so the guard would
     always read "no drag" and open the editor on every adjustment. */
  const justDragged = useRef(false);
  const [preview, setPreview] = useState<Drag | null>(null);

  /* The preview is the prediction: it follows the pointer and stays where
     it was dropped until the refetch lands, so the block never jumps back
     first. A rejection's reason shows in the mutation notice. */
  const save = useOptimisticMutation({
    queryKey: () => keys.calendar(),
    mutationFn: (v: { id: string; startedAt: Date; endedAt: Date }) =>
      api.updateEntry(v.id, {
        startedAt: v.startedAt.toISOString(),
        endedAt: v.endedAt.toISOString(),
      }),
    invalidate: (qc) => invalidateEntryData(qc),
    movesHome: true,
    // Not over a drag still in the user's hand.
    onSettled: () => {
      if (!active.current) setPreview(null);
    },
  });

  function begin(
    event: React.PointerEvent,
    entry: TimeEntry,
    mode: DragMode,
    column: HTMLElement,
    dayStart: Date,
    dayEnd: Date,
  ) {
    if (entry.endedAt == null) return;
    event.preventDefault();
    event.stopPropagation();

    const from = {
      startedAt: new Date(entry.startedAt),
      endedAt: new Date(entry.endedAt),
    };
    active.current = {
      entryId: entry.id,
      entry,
      mode,
      column,
      dayStart,
      dayEnd,
      columns: dayColumns(column),
      originX: event.clientX,
      originY: event.clientY,
      fromStart: from.startedAt,
      fromEnd: from.endedAt,
      moved: false,
      ...from,
    };
    // Capture, so the gesture survives the pointer leaving the block — which
    // it does immediately, because the block is being dragged out from under
    // it.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  /**
   * Press on empty grid: a drag draws a new entry's range, and a press that
   * never travels is a click, which takes `clickMinutes` from where it
   * landed.
   * Either way the range goes to `onDrawn`, which opens the editor on it.
   */
  function draw(
    event: React.PointerEvent,
    column: HTMLElement,
    dayStart: Date,
    dayEnd: Date,
    onDrawn: Drawn,
    clickMinutes: number,
  ) {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.preventDefault();
    const at = new Date(0);
    active.current = {
      entryId: null,
      entry: null,
      mode: 'draw',
      onDrawn,
      clickMinutes,
      column,
      dayStart,
      dayEnd,
      columns: [column],
      originX: event.clientX,
      originY: event.clientY,
      fromStart: at,
      fromEnd: at,
      moved: false,
      startedAt: at,
      endedAt: at,
    };
    column.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent) {
    const a = active.current;
    if (!a) return;

    if (!a.moved && travel(a, event) < DRAG_THRESHOLD_PX) return;
    a.moved = true;

    const box = a.column.getBoundingClientRect();
    const next = resolve(a, event, box);
    a.startedAt = next.startedAt;
    a.endedAt = next.endedAt;
    setPreview({
      entryId: a.entryId,
      entry: a.entry,
      column: a.column,
      ...next,
    });
  }

  function end() {
    const a = active.current;
    active.current = null;
    if (!a) return;
    justDragged.current = a.moved;

    /* The drawn block stays on the grid while its editor is open, until
       `release`: a new entry never leaves the grid between the gesture and
       the server's answer. */
    if (a.entryId === null) {
      const [startedAt, endedAt] = drawn(a);
      setPreview({
        entryId: null,
        entry: null,
        column: a.column,
        startedAt,
        endedAt,
      });
      a.onDrawn?.(startedAt, endedAt);
      return;
    }

    // A click, not a drag. The block's own onClick opens the editor.
    if (!a.moved) {
      setPreview(null);
      return;
    }
    // Nothing changed once snapped, so there is nothing to write.
    if (
      a.startedAt.getTime() === a.fromStart.getTime() &&
      a.endedAt.getTime() === a.fromEnd.getTime()
    ) {
      setPreview(null);
      return;
    }
    save.mutate({
      id: a.entryId,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
    });
  }

  function cancel() {
    active.current = null;
    justDragged.current = false;
    setPreview(null);
  }

  return {
    preview,
    /** True while a write is in flight, so the block can show it is settling. */
    saving: save.isPending,
    begin,
    draw,
    /** Drop a drawn block, once the editor it opened has closed. */
    release: () => setPreview((p) => (p?.entryId === null ? null : p)),
    move,
    end,
    cancel,
    /**
     * Whether the click now firing came from a drag, consuming the flag.
     *
     * Consuming it matters: left set, the NEXT genuine click on the block
     * would be swallowed and the entry would refuse to open.
     */
    dragging: () => {
      const was = justDragged.current;
      justDragged.current = false;
      return was;
    },
  };
}

/**
 * What a finished draw hands the editor. A click draws `clickMinutes` from
 * where it landed, the slot that was under the pointer; the dialog on top of
 * it makes the length one edit away.
 */
function drawn(a: Active): [Date, Date] {
  if (a.moved) return [a.startedAt, a.endedAt];
  const box = a.column.getBoundingClientRect();
  const at = (a.originY - box.top) / box.height;
  const r = drawnRange(at, at, a.dayStart, a.dayEnd, a.clickMinutes);
  return [r.startedAt, r.endedAt];
}

/** The day columns beside `column`, itself included, in day order. */
function dayColumns(column: HTMLElement): HTMLElement[] {
  const all = column.parentElement?.querySelectorAll<HTMLElement>(
    ':scope > [data-day-column]',
  );
  return all ? [...all] : [column];
}

/** How far the pointer has gone. Only a move goes sideways. */
function travel(a: Active, event: React.PointerEvent): number {
  const dy = Math.abs(event.clientY - a.originY);
  if (a.mode !== 'move') return dy;
  return Math.max(dy, Math.abs(event.clientX - a.originX));
}

/**
 * How many days over from its own column the pointer is: the column under
 * it, or the nearest end of the row past either edge.
 */
function daysOver(a: Active, clientX: number): number {
  const within = (el: HTMLElement) => {
    const { left, width } = el.getBoundingClientRect();
    return clientX >= left && clientX < left + width;
  };
  if (within(a.column)) return 0;
  const first = a.columns[0];
  let at = a.columns.findIndex(within);
  if (at === -1)
    at =
      first && clientX < first.getBoundingClientRect().left
        ? 0
        : a.columns.length - 1;
  return at - a.columns.indexOf(a.column);
}

/** Where the pointer puts the entry, given what the gesture is adjusting. */
function resolve(
  a: Active,
  { clientX, clientY }: React.PointerEvent,
  box: DOMRect,
): { startedAt: Date; endedAt: Date } {
  const fraction = (y: number) => (y - box.top) / box.height;
  const at = (y: number) => instantAt(fraction(y), a.dayStart, a.dayEnd);

  if (a.mode === 'draw') {
    return drawnRange(
      fraction(a.originY),
      fraction(clientY),
      a.dayStart,
      a.dayEnd,
    );
  }

  if (a.mode === 'move') {
    // The grab offset is preserved by moving the START by the snapped delta,
    // rather than putting the start under the pointer — otherwise grabbing a
    // block near its bottom would jump it upward on the first pixel.
    const delta = at(clientY).getTime() - at(a.originY).getTime();
    const moved = movedTo(
      a.fromStart,
      a.fromEnd,
      new Date(a.fromStart.getTime() + delta),
    );
    return movedByDays(
      moved.startedAt,
      moved.endedAt,
      daysOver(a, clientX),
      tz,
    );
  }
  return resized(a.fromStart, a.fromEnd, a.mode, at(clientY));
}
