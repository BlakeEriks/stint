'use client';

import { useEffect, useState } from 'react';
import {
  formatCompact,
  startOfLocalDay,
  startOfLocalDayOffset,
} from '@stint/core';
import type { TimeEntry } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { position, workedWindow } from '@/lib/client/use-calendar';

/** The calendar's scale, so a block is the same size in both places. */
const PX_PER_HOUR = 44;

/** Gridlines every hour; the dock is too narrow for the calendar's 3-hour step. */
const HOUR_STEP = 1;

/**
 * Today's entries as a day column, in the dock.
 *
 * The list answers "what have I booked"; this answers "where did the day go",
 * which is the question that catches an hour nobody tracked. It is the same
 * column `/calendar` draws — same window, same positions, same 44px hour —
 * with the gestures off: at this width a 15-minute entry is 11px tall, fine
 * to click and far too small to grab an edge of.
 *
 * Read-only by construction. A block opens the editor and empty grid does
 * nothing, because the gap between two blocks here is a few pixels of
 * ambiguity and the timer bar already owns starting work.
 */
export function TodayGrid({
  entries,
  colors,
  onEdit,
}: {
  /** Today's entries INCLUDING the running one, unlike the list. */
  entries: TimeEntry[];
  colors: Map<string, string | null>;
  onEdit: (entry: TimeEntry) => void;
}) {
  /* The real next midnight, not +24h: a DST day is 23 or 25 hours and every
     position here is a fraction of the column's own span. */
  const dayStart = startOfLocalDay(new Date(), tz);
  const dayEnd = startOfLocalDayOffset(dayStart, tz, -1);

  /* A running block grows and the now-line moves, so both need a clock. A
     minute is the resolution the line is read at — a second's tick would
     re-render the column 60 times for a line that moves 0.7px. */
  const minute = useMinute(entries.some((e) => e.endedAt === null));

  const [from, to] = workedWindow(entries, dayStart, dayEnd);
  const placed = position(entries, from, to);

  const hours = (to.getTime() - from.getTime()) / 3_600_000;
  const height = hours * PX_PER_HOUR;

  /* Where now falls in the drawn window, as a fraction. Outside it before the
     first entry of the day or after the window's end, in which case there is
     no line to draw rather than one pinned to an edge pretending to be now. */
  const nowAt = minute ? fractionOf(new Date(), from, to) : null;

  /* No label of its own: the section around it is already "Today's entries",
     and a second one on the column reads as a nested region with the same
     name. */
  return (
    <div className="flex">
      <div className="flex-none pr-1.5" style={{ width: 30 }}>
        {marks(from, to).map((m) => (
          <div
            key={m.at.toISOString()}
            className="-translate-y-[5px] text-right type-meta text-subtle tabular-nums"
            style={{ height: PX_PER_HOUR * HOUR_STEP }}
          >
            {m.label}
          </div>
        ))}
      </div>

      <div className="relative min-w-0 flex-1" style={{ height }}>
        {marks(from, to).map((m, i) =>
          i === 0 ? null : (
            <div
              key={m.at.toISOString()}
              aria-hidden
              className="absolute inset-x-0 border-t border-edge-grid"
              style={{ top: `${fractionOf(m.at, from, to) * 100}%` }}
            />
          ),
        )}

        {placed.map((item) => (
          <Block
            key={item.entry.id}
            item={item}
            color={
              item.entry.projectId
                ? colors.get(item.entry.projectId)
                : undefined
            }
            onEdit={onEdit}
          />
        ))}

        {nowAt !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-accent-default"
            style={{ top: `${nowAt * 100}%` }}
          >
            <span className="absolute -top-[3px] -left-[3px] size-1.5 rounded-full bg-accent-default" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Block({
  item,
  color,
  onEdit,
}: {
  item: ReturnType<typeof position>[number];
  color?: string | null;
  onEdit: (entry: TimeEntry) => void;
}) {
  const { entry, top, height, lane, lanes } = item;
  const running = entry.endedAt === null;

  const name = entry.taskName || 'Untitled';
  const range = `${clock(entry.startedAt)}${
    entry.endedAt ? `–${clock(entry.endedAt)}` : ' (running)'
  }`;

  const style = {
    top: `${top * 100}%`,
    height: `${height * 100}%`,
    left: `${(lane / lanes) * 100}%`,
    width: `${(1 / lanes) * 100}%`,
    borderLeft: color ? `2.5px solid ${color}` : undefined,
  };

  const shape = `absolute overflow-hidden rounded-[5px] border px-1.5 py-0.5 text-left ${
    running
      ? 'border-accent-default bg-accent-muted'
      : 'border-edge-subtle bg-surface-hover'
  }`;

  const body = (
    <>
      <p className="truncate type-support leading-tight text-primary">{name}</p>
      {height > 0.045 ? (
        <p className="truncate type-meta text-subtle">
          {formatCompact(entry.durationSeconds ?? 0)}
        </p>
      ) : null}
    </>
  );

  /* A running entry is not a button. `EntryDialog` refuses one by design —
     its end does not exist yet — and the timer bar owns retitling mid-run, so
     a click here would open a dialog that declines to edit what was clicked. */
  if (running) {
    return (
      <div className={shape} style={style}>
        {/* The times as text rather than an `aria-label`: a plain div takes
            no accessible name, and the roles that would carry one here
            (`group`, `img`) both describe something this is not. */}
        <span className="sr-only">{`${name}, ${range}`}</span>
        <div aria-hidden>{body}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      /* The visible text is a truncated name and a duration, so the times go
         in the accessible name or a screen reader cannot tell two apart. */
      aria-label={`Edit ${name}, ${range}${entry.invoiceId ? ', billed' : ''}`}
      title={`${name} · ${range}`}
      onClick={() => onEdit(entry)}
      className={`${shape} hover:bg-surface-active focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none`}
      style={style}
    >
      {body}
    </button>
  );
}

/**
 * Re-render once a minute while something is moving.
 *
 * Returns false until after hydration, like `useTimer`'s own tick: a clock
 * read during SSR and again on the client lands on different minutes, which
 * React reports as a hydration mismatch. Until then there is no now-line,
 * which is correct — the server does not know what time it is here.
 */
function useMinute(running: boolean): boolean {
  const [, force] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    /* The line moves whether or not a timer runs, so this ticks either way.
       `running` only sets the rate: a growing block is redrawn on the minute
       too, and its own duration text comes from the server. */
    void running;
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [running]);

  return hydrated;
}

const fractionOf = (at: Date, from: Date, to: Date) =>
  (at.getTime() - from.getTime()) / (to.getTime() - from.getTime());

function marks(from: Date, to: Date) {
  const out: { at: Date; label: string }[] = [];
  const step = HOUR_STEP * 3_600_000;
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    const at = new Date(t);
    out.push({
      at,
      label: new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: tz,
      }).format(at),
    });
  }
  return out;
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(iso));
