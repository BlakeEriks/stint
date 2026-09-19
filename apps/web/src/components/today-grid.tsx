'use client';

import { useEffect, useState } from 'react';
import {
  formatCompact,
  formatLocalTime,
  startOfLocalDay,
  startOfLocalDayOffset,
} from '@stint/core';
import type { TimeEntry } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { PX_PER_HOUR, position, workedWindow } from '@/lib/client/use-calendar';

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
  const minute = useMinute();

  /* The window the entries want, then widened to reach NOW.
     `workedWindow` is derived from the entries alone, which is right for
     `/calendar` — it draws any day, and most days are not today. This column
     is always today, and a day whose grid stops before the current hour is a
     day you cannot see the rest of: stop at 13:00 having worked the morning
     and the now-line is drawn below the grid at 17:00, floating under it.

     Rounded out to the hour, like the rest of the window, so the gridlines
     and their labels stay on the hour. */
  const [worked, workedTo] = workedWindow(entries, dayStart, dayEnd);
  const [from, to] = minute
    ? withNow(worked, workedTo, new Date(), dayStart, dayEnd)
    : [worked, workedTo];

  const placed = position(entries, from, to);

  const hours = (to.getTime() - from.getTime()) / 3_600_000;
  const height = hours * PX_PER_HOUR;

  /* Where now falls in the drawn window. The window covers it by
     construction, but the guard stays: it is the one value read off a clock
     rather than the data, so a zero-length window or a stale render must not
     put a line outside the grid it belongs to. */
  const at = minute ? fractionOf(new Date(), from, to) : null;
  const nowAt = at !== null && at >= 0 && at <= 1 ? at : null;

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
function useMinute(): boolean {
  const [, force] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  /* Unconditional: the line moves whether or not a timer is running, and the
     window follows it. A tick gated on a running timer would freeze the line
     on an idle afternoon, which is the afternoon you most want it. */
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return hydrated;
}

/**
 * Widen a window so it contains `now`, rounded out to the hour.
 *
 * Only this column needs it. `/calendar` draws any day and takes its window
 * from the entries, which is correct there — the current time means nothing
 * on a day in the past. Here the column IS today, and the now-line is the
 * thing it exists to show.
 *
 * Clamped to the day, so a window can still never cross midnight and
 * `position()`'s fractions stay inside the column.
 */
function withNow(
  from: Date,
  to: Date,
  now: Date,
  dayStart: Date,
  dayEnd: Date,
): [Date, Date] {
  const hourMs = 3_600_000;
  /* Elapsed hours from the column's own start, not a wall clock: a DST day is
     23 or 25 hours long and the column is measured in elapsed time. */
  const hoursFrom = (at: Date) => (at.getTime() - dayStart.getTime()) / hourMs;
  const at = (hours: number) =>
    new Date(
      Math.min(
        Math.max(dayStart.getTime() + hours * hourMs, dayStart.getTime()),
        dayEnd.getTime(),
      ),
    );

  const nowH = hoursFrom(now);
  if (nowH >= hoursFrom(from) && nowH <= hoursFrom(to)) return [from, to];

  /* An hour of air on the side it grew, so the line is never flush against
     an edge with no room to read it. */
  return nowH < hoursFrom(from)
    ? [at(Math.floor(nowH) - 1), to]
    : [from, at(Math.ceil(nowH) + 1)];
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

const clock = (iso: string) => formatLocalTime(iso, tz);
