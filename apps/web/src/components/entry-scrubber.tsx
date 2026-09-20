'use client';

import { useMemo, useRef, useState } from 'react';
import {
  formatLocalTime,
  instantAt,
  movedTo,
  resized,
  snapMs,
  windowFor,
} from '@stint/core';

/** What the pointer is doing to the block. Same three as the calendar's. */
type Mode = 'move' | 'start' | 'end';

/**
 * Adjusting an entry's times by dragging it on a strip.
 *
 * The strip and the dialog's `start`/`end` fields are ONE value with two
 * controls: a drag rewrites the fields on every pointer move, and a typed
 * time redraws the block. Neither is authoritative — `onChange` is the only
 * way this reports anything, and the times it draws come back in as props.
 *
 * Nothing commits here. The dialog's Save writes the server, like every other
 * field in it; `useEntryDrag` PATCHes on release only because the calendar has
 * no Save to wait for. For the same reason there is no drag threshold: this
 * block is not also the control that opens the editor, so a press has nothing
 * to disambiguate from.
 *
 * Horizontal, which is not the calendar's axis. The dialog is a column of
 * rows, and at the calendar's 44px/hour a day is ~700px of dialog to adjust
 * two fields — besides reading against the left-to-right Start → End pair
 * directly beneath it.
 */
export function EntryScrubber({
  startedAt,
  endedAt,
  dayStart,
  dayEnd,
  color,
  disabled = false,
  onChange,
  tz,
}: {
  startedAt: Date;
  endedAt: Date;
  /** The local day the entry sits in, so the span is DST-correct. */
  dayStart: Date;
  dayEnd: Date;
  /** The client's colour, or null for internal work. */
  color?: string | null;
  disabled?: boolean;
  onChange: (next: { startedAt: Date; endedAt: Date }) => void;
  tz: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: Mode;
    originX: number;
    fromStart: Date;
    fromEnd: Date;
  } | null>(null);
  const [active, setActive] = useState<Mode | null>(null);

  /* The window the strip draws, held still for the duration of a gesture.
     A drag changes the times on every pointer move, so a window derived
     fresh each render would widen under the pointer and the block would
     crawl away from it. Frozen when a gesture begins, released when it ends,
     and otherwise recomputed — which is how a TYPED time re-crops the strip,
     the one other moment it is safe, no pointer being held. */
  const frozen = useRef<{ from: Date; to: Date } | null>(null);
  const view =
    frozen.current ?? windowFor(startedAt, endedAt, dayStart, dayEnd);

  const span = view.to.getTime() - view.from.getTime();
  const pct = (at: Date) => ((at.getTime() - view.from.getTime()) / span) * 100;

  const left = pct(startedAt);
  const width = pct(endedAt) - left;

  const begin = (mode: Mode) => (event: React.PointerEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    frozen.current = view;
    drag.current = {
      mode,
      originX: event.clientX,
      fromStart: startedAt,
      fromEnd: endedAt,
    };
    setActive(mode);
    // Capture, so the gesture survives the pointer leaving the block — which
    // it does immediately, the block being dragged out from under it.
    strip.current?.setPointerCapture(event.pointerId);
  };

  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !strip.current) return;

    const box = strip.current.getBoundingClientRect();
    const at = (x: number) =>
      instantAt((x - box.left) / box.width, view.from, view.to);

    if (d.mode === 'move') {
      /* The grab offset is preserved by moving the START by the snapped
         delta rather than putting it under the pointer — otherwise grabbing
         a block near its right edge would jump it left on the first pixel.

         The delta is taken from RAW positions and snapped once. Differencing
         two already-snapped instants loses the gesture whenever both ends
         round to the same quarter hour, which on a cropped window is most
         short drags: the strip spans hours rather than a day, so a 60px move
         is ~an hour and both ends can land in the same bucket. */
      const raw =
        ((event.clientX - d.originX) / box.width) *
        (view.to.getTime() - view.from.getTime());
      const delta = snapMs(raw);
      const next = movedTo(
        d.fromStart,
        d.fromEnd,
        new Date(d.fromStart.getTime() + delta),
      );
      /* Held inside the window, moving both ends together: clamping them
         separately would silently change the duration at the edge. */
      const length = next.endedAt.getTime() - next.startedAt.getTime();
      const first = Math.max(
        view.from.getTime(),
        Math.min(next.startedAt.getTime(), view.to.getTime() - length),
      );
      onChange({
        startedAt: new Date(first),
        endedAt: new Date(first + length),
      });
      return;
    }

    onChange(resized(d.fromStart, d.fromEnd, d.mode, at(event.clientX)));
  };

  const finish = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    frozen.current = null;
    setActive(null);
    strip.current?.releasePointerCapture(event.pointerId);
  };

  const time = (at: Date) => formatLocalTime(at, tz);

  const marks = useMemo(
    () => hourMarks(view.from, view.to, tz),
    [view.from, view.to, tz],
  );

  const minutes = Math.round(
    (endedAt.getTime() - startedAt.getTime()) / 60_000,
  );
  const readout = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

  return (
    <div
      ref={strip}
      /* The strip carries no role and no accessible name — every part of it
         is `aria-hidden`, the labelled time fields being the same value. The
         test id is how a test reaches a control that assistive tech is
         deliberately not offered. */
      data-testid="entry-scrubber"
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      className="relative h-[60px] touch-none select-none overflow-hidden
                 rounded-lg border border-edge-subtle bg-surface-recessed"
    >
      {marks.map((m) => (
        <div
          key={m.pct}
          aria-hidden
          className="absolute inset-y-0 w-px bg-edge-grid"
          style={{ left: `${m.pct}%` }}
        >
          {m.pct > 3 && m.pct < 97 ? (
            <span
              className="absolute bottom-0.5 -translate-x-1/2 whitespace-nowrap
                         type-meta text-subtle"
            >
              {m.label}
            </span>
          ) : null}
        </div>
      ))}

      <div
        /* The strip is a pointer affordance and carries no keyboard path of
           its own: Start and End below are `type="time"` with a 15-minute
           step, so arrows already reach every value a drag can produce. A
           second tab stop for one value is two controls disagreeing about
           which is authoritative. */
        aria-hidden
        onPointerDown={begin('move')}
        className={`absolute top-1.5 bottom-5 flex items-center justify-center
                    rounded-[5px] border px-3 ${
                      color ? 'border-edge-subtle' : 'border-edge-default'
                    } ${disabled ? 'cursor-default opacity-75' : 'cursor-grab active:cursor-grabbing'}`}
        style={{
          left: `${left}%`,
          width: `${width}%`,
          /* The client's colour, as a left edge and a wash — the same
             reading as the calendar's block, where a saturated tile behind
             text is what this avoids. The accent is Save's. */
          borderLeft: color ? `2px solid ${color}` : undefined,
          background: color
            ? `color-mix(in oklab, ${color} 26%, var(--color-surface-elevated))`
            : 'var(--color-surface-hover)',
        }}
      >
        {/* Hidden rather than truncated below the width that fits it: a
            clipped duration is a misread number on a billing screen. */}
        {width > 12 ? (
          <span className="type-duration text-strong">{readout}</span>
        ) : null}

        {disabled ? null : (
          <>
            <Handle
              edge="start"
              onPointerDown={begin('start')}
              on={active === 'start'}
            />
            <Handle
              edge="end"
              onPointerDown={begin('end')}
              on={active === 'end'}
            />
          </>
        )}
      </div>

      {active ? (
        <span
          aria-hidden
          className="absolute top-0 -translate-x-1/2 -translate-y-full rounded
                     border border-edge-default bg-surface-active px-1.5
                     type-meta text-strong"
          style={{ left: `${active === 'start' ? left : left + width}%` }}
        >
          {active === 'move'
            ? `${time(startedAt)}–${time(endedAt)}`
            : time(active === 'start' ? startedAt : endedAt)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A resize target on an edge of the block.
 *
 * It STRADDLES the edge rather than sitting inside it. At
 * `MIN_ENTRY_MINUTES` the block is ~27px however tightly the window crops,
 * so two inset handles would leave a few pixels of body and the move gesture
 * would be unreachable on exactly the entry most likely to be a mistake worth
 * dragging.
 */
function Handle({
  edge,
  on,
  onPointerDown,
}: {
  edge: 'start' | 'end';
  on: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  return (
    <span
      aria-hidden
      data-testid={`scrubber-handle-${edge}`}
      onPointerDown={onPointerDown}
      className={`absolute -inset-y-px z-10 flex w-4 cursor-ew-resize items-center
                  justify-center ${edge === 'start' ? '-left-2' : '-right-2'}`}
    >
      <span
        className={`h-4 w-0.5 rounded-full ${
          on ? 'bg-strong' : 'bg-edge-control'
        }`}
      />
    </span>
  );
}

/**
 * The labelled ticks for a window, as percentages of it.
 *
 * The step comes from the span so a short window is not ruled as sparsely as
 * a long one. Stepping by elapsed time from the window's start, like the
 * calendar's own marks: a DST day is 23 or 25 hours, so a wall-clock hour is
 * not always 3600s of the strip.
 */
function hourMarks(from: Date, to: Date, tz: string) {
  const span = to.getTime() - from.getTime();
  const hours = span / 3_600_000;
  const step = hours <= 4 ? 0.5 : hours <= 8 ? 1 : hours <= 16 ? 2 : 3;

  /* The hour alone, and the meridiem only where it turns over. A tick is a
     ruler mark rather than a reading: "8:00 AM" wraps to two lines in a 60px
     strip, and the times themselves are in the fields below and on the block
     mid-drag. `hourCycle` so midnight is 12 AM rather than 24. */
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
    timeZone: tz,
  });

  const marks: { pct: number; label: string }[] = [];
  for (let h = step; h * 3_600_000 < span; h += step) {
    const at = new Date(from.getTime() + h * 3_600_000);
    const got = parts.formatToParts(at);
    const hour = got.find((p) => p.type === 'hour')?.value ?? '';
    const minute = got.find((p) => p.type === 'minute')?.value ?? '00';
    const period = got.find((p) => p.type === 'dayPeriod')?.value ?? '';
    marks.push({
      pct: ((h * 3_600_000) / span) * 100,
      /* Noon and midnight carry the meridiem, because they are the two the
         hour alone cannot distinguish; a half-hour tick carries minutes. */
      label:
        minute === '00'
          ? hour === '12'
            ? `${hour}${period.toLowerCase()}`
            : hour
          : `${hour}:${minute}`,
    });
  }
  return marks;
}
