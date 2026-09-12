'use client';

import { formatCompact, formatClock } from '@stint/core';
import { Button } from '@/components/ui/button';
import { useCalendar, type PositionedEntry } from '@/lib/client/use-calendar';
import { useProjectColors } from '@/lib/client/use-project-colors';

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

/**
 * A week of logged time.
 *
 * This visualises what was tracked; it does not schedule. There is no
 * "planned" layer and no external calendar — the app's claim is that the
 * numbers on the invoice are the numbers you worked.
 */
export function Calendar() {
  const cal = useCalendar();
  const colorByProject = useProjectColors();

  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: cal.tz,
  }).format(cal.weekStart);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
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

      <div className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-primary shadow-card">
        <div className="flex border-b border-edge-subtle">
          <div className="w-12 flex-none sm:w-14" />
          {cal.days.map((day) => (
            <DayHeading
              key={day.date}
              date={day.date}
              at={day.at}
              tz={cal.tz}
              seconds={day.totalSeconds}
            />
          ))}
        </div>

        {/* One scroll container so the hour gutter cannot drift from the grid. */}
        <div className="max-h-[62vh] overflow-y-auto">
          <div className="flex">
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

            {cal.days.map((day) => (
              <DayColumn
                key={day.date}
                positioned={day.positioned}
                colors={colorByProject}
                tz={cal.tz}
              />
            ))}
          </div>
        </div>
      </div>

      {cal.isLoading ? (
        <p className="mt-3 type-support text-subtle">Loading…</p>
      ) : cal.weekSeconds === 0 ? (
        <p className="mt-3 type-support text-subtle">
          Nothing logged this week.
        </p>
      ) : null}
    </main>
  );
}

/** Fixed pixel height so an hour is the same size on every screen. */
const GRID_HEIGHT = 720;

function DayHeading({
  date,
  at,
  tz,
  seconds,
}: {
  date: string;
  at: Date;
  tz: string;
  seconds: number;
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

  return (
    <div className="min-w-0 flex-1 px-1 py-2 text-center">
      <div className="type-label text-subtle">{weekday}</div>
      <div
        className={`type-body ${today ? 'font-semibold text-strong' : 'text-primary'}`}
      >
        {dayNum}
      </div>
      <div className="type-meta text-subtle">
        {seconds > 0 ? formatCompact(seconds) : '—'}
      </div>
    </div>
  );
}

function DayColumn({
  positioned,
  colors,
  tz,
}: {
  positioned: PositionedEntry[];
  colors: Map<string, string | null>;
  tz: string;
}) {
  return (
    <div
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
        <EntryBlock key={item.entry.id} item={item} colors={colors} tz={tz} />
      ))}
    </div>
  );
}

function EntryBlock({
  item,
  colors,
  tz,
}: {
  item: PositionedEntry;
  colors: Map<string, string | null>;
  tz: string;
}) {
  const { entry, top, height, lane, lanes } = item;
  const color = entry.projectId ? colors.get(entry.projectId) : undefined;
  const running = entry.endedAt === null;

  const time = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    }).format(new Date(iso));

  const title = `${entry.taskName || 'Untitled'} · ${time(entry.startedAt)}${
    entry.endedAt ? `–${time(entry.endedAt)}` : ' (running)'
  }`;

  return (
    <div
      title={title}
      className={`absolute overflow-hidden rounded-[5px] border px-1.5 py-0.5 text-left ${
        running
          ? 'border-accent-default bg-accent-muted'
          : 'border-edge-subtle bg-surface-elevated'
      }`}
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
      <p className="truncate type-support leading-tight text-primary">
        {entry.taskName || 'Untitled'}
      </p>
      {height > 0.045 ? (
        <p className="truncate type-meta text-subtle">
          {formatCompact(entry.durationSeconds ?? 0)}
        </p>
      ) : null}
    </div>
  );
}
