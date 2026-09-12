'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { instantAt, movedTo, resized, DRAG_THRESHOLD_PX } from '@stint/core';
import { api, ApiError, type TimeEntry } from './api';

/** What the pointer is doing to a block. */
export type DragMode = 'move' | 'start' | 'end';

/** A drag in progress, for the block to paint itself from. */
export interface Drag {
  entryId: string;
  startedAt: Date;
  endedAt: Date;
}

interface Active extends Drag {
  mode: DragMode;
  /** The column, so pixels resolve to a fraction of the day it spans. */
  column: HTMLElement;
  dayStart: Date;
  dayEnd: Date;
  originY: number;
  /** Original times, so a drag is computed from them rather than compounding. */
  fromStart: Date;
  fromEnd: Date;
  moved: boolean;
}

/**
 * Adjusting an entry by dragging its block.
 *
 * The gesture only commits on release, and only if the pointer actually
 * travelled — `DRAG_THRESHOLD_PX`. That matters more here than in most drag
 * implementations: a block is also the control that opens the editor, so
 * without a threshold every click would land a PATCH that rewrites billable
 * time by whatever a 1px tremor resolved to.
 *
 * Vertical only, within one day. Moving an entry to a different day is the
 * rarer correction and the dialog already does it; the common one is "this
 * started at 9, not 9:30", and keeping the drag in one column means the
 * fraction→instant maths uses that column's own span, which is what makes it
 * DST-correct.
 */
export function useEntryDrag(onConflict?: (message: string) => void) {
  const queryClient = useQueryClient();
  const active = useRef<Active | null>(null);
  /* A completed drag, kept until the click it produces has been suppressed.
     Asking whether a drag is IN PROGRESS cannot work: the pointer-up that ends
     the gesture clears it, and the click fires after that — so the guard would
     always read "no drag" and open the editor on every adjustment. */
  const justDragged = useRef(false);
  const [preview, setPreview] = useState<Drag | null>(null);

  const save = useMutation({
    mutationFn: (v: { id: string; startedAt: Date; endedAt: Date }) =>
      api.updateEntry(v.id, {
        startedAt: v.startedAt.toISOString(),
        endedAt: v.endedAt.toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    /* A rejected drag must say so. The block springs back to where the server
       says it is, which without a message reads as the gesture not registering
       — and the most likely rejection is the billed-entry lock, which the user
       can act on. */
    onError: (e) =>
      onConflict?.(
        e instanceof ApiError ? e.message : 'Could not move this entry.',
      ),
    // The preview clears either way, so a failure cannot leave a block
    // painted somewhere the server disagrees with.
    onSettled: () => setPreview(null),
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
      mode,
      column,
      dayStart,
      dayEnd,
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

  function move(event: React.PointerEvent) {
    const a = active.current;
    if (!a) return;

    if (!a.moved && Math.abs(event.clientY - a.originY) < DRAG_THRESHOLD_PX) {
      return;
    }
    a.moved = true;

    const box = a.column.getBoundingClientRect();
    const next = resolve(a, event.clientY, box);
    a.startedAt = next.startedAt;
    a.endedAt = next.endedAt;
    setPreview({ entryId: a.entryId, ...next });
  }

  function end() {
    const a = active.current;
    active.current = null;
    if (!a) return;
    justDragged.current = a.moved;

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

/** Where the pointer puts the entry, given what the gesture is adjusting. */
function resolve(
  a: Active,
  clientY: number,
  box: DOMRect,
): { startedAt: Date; endedAt: Date } {
  const at = (y: number) =>
    instantAt((y - box.top) / box.height, a.dayStart, a.dayEnd);

  if (a.mode === 'move') {
    // The grab offset is preserved by moving the START by the snapped delta,
    // rather than putting the start under the pointer — otherwise grabbing a
    // block near its bottom would jump it upward on the first pixel.
    const delta = at(clientY).getTime() - at(a.originY).getTime();
    return movedTo(
      a.fromStart,
      a.fromEnd,
      new Date(a.fromStart.getTime() + delta),
    );
  }
  return resized(a.fromStart, a.fromEnd, a.mode, at(clientY));
}
