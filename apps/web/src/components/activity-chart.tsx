'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCompact, startOfLocalDayOffset } from '@stint/core';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useTimeZone } from '@/lib/client/use-timer';

/**
 * Hours per day, stacked by client.
 *
 * It answers *when did the work happen, and whose was it?*
 *
 * **Every share shows, not just the largest.** A day split 6h Northwind / 2h
 * Byrne renders both — the 2h is exactly what gets argued about in a scope
 * conversation.
 *
 * **Magnitude shows.** A bar carries the number: "was Tuesday a three-hour
 * day or a nine-hour day?" is answerable at a glance.
 *
 * **Hue is still the client**, resolved exactly as everywhere else. No new
 * colour meaning is introduced — and never the accent, which belongs to the
 * running timer. Internal work keeps a neutral that still reads as worked
 * rather than as rest.
 *
 * **Gaps stay real.** Every day in the range gets a column, so a blank one is
 * a weekend or a dry spell rather than missing data.
 */

/* 90 days is deliberately absent. At day granularity it is 90 bars in a
   ~660px card — a ~4px bar. It needs week bucketing (`granularity: 'week'`,
   server-side for the same DST reason day bucketing already lives there),
   which is a route change with its own correctness tests rather than an
   option to add here. */
const RANGES = [
  { days: 14, label: '14d' },
  { days: 30, label: '30d' },
] as const;

type Days = (typeof RANGES)[number]['days'];

/* Past this many clients the legend becomes the card and the hues stop being
   separable. The remainder collapses into one neutral band, the same shape as
   `moreClients` on the Unbilled card. */
const MAX_SERIES = 5;

/** Internal work: no client, so no hue — but not rest either. */
const INTERNAL = '';
const NEUTRAL = 'var(--text-subtle)';

export function ActivityChart() {
  const tz = useTimeZone();
  const [days, setDays] = useState<Days>(30);
  const now = new Date();
  const from = startOfLocalDayOffset(now, tz, days - 1);

  const { data } = useQuery({
    queryKey: ['activity', tz, days],
    queryFn: () =>
      api.activity({ from: from.toISOString(), to: now.toISOString(), tz }),
  });

  /* Archived clients included: work billed to a finished engagement still
     belongs in the history, and dropping its colour would silently reassign
     those hours to the neutral band. */
  const { data: clientData } = useQuery({
    queryKey: ['clients', 'withArchived'],
    queryFn: () => api.clients({ includeArchived: true }),
  });

  if (!data) return null;

  const clients = new Map((clientData?.clients ?? []).map((c) => [c.id, c]));
  const byDate = new Map(data.days.map((d) => [d.date, d]));

  const columns = Array.from({ length: days }, (_, i) => {
    const at = startOfLocalDayOffset(now, tz, days - 1 - i);
    const key = localKey(at, tz);
    return { key, at, day: byDate.get(key) };
  });

  /* Rank clients over the whole window, not per day, so a client keeps the
     same stacking position across columns — a band that jumps order between
     days cannot be followed by eye. */
  const totals = new Map<string, number>();
  for (const { day } of columns) {
    for (const [id, seconds] of Object.entries(day?.byClient ?? {})) {
      totals.set(id, (totals.get(id) ?? 0) + seconds);
    }
  }
  const ranked = [...totals.entries()]
    .filter(([, seconds]) => seconds > 0)
    .sort((a, b) => b[1] - a[1]);
  const named = ranked
    .filter(([id]) => id !== INTERNAL)
    .slice(0, MAX_SERIES)
    .map(([id]) => id);
  const inLegend = new Set(named);

  /* The tallest day sets the scale. A fixed axis would flatten a quiet
     fortnight into nothing; this keeps the shape readable at any workload. */
  const peak = Math.max(...columns.map((c) => c.day?.totalSeconds ?? 0), 1);
  const windowSeconds = columns.reduce(
    (sum, c) => sum + (c.day?.totalSeconds ?? 0),
    0,
  );

  /* Anything past the top few, plus internal work, becomes one neutral band
     at the foot of each column. Grouping them keeps the stack honest — the
     hours are still counted and the bar is still the day's real height. */
  const hasOther = ranked.some(([id]) => !inLegend.has(id));

  return (
    <section className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3
            aria-hidden
            strokeWidth={1.75}
            className="size-4 flex-none text-muted"
          />
          <h2 className="type-heading truncate text-strong">Activity</h2>
        </div>
        {/* REAL radio inputs, not buttons wearing `role="radio"`.

            These are one setting with two values, so a screen reader should
            hear the current one — which the roles alone did convey. What they
            could not is the keyboard behaviour: a native radio group is one
            tab stop and moves between options with the arrow keys, and
            hand-rolling that is exactly the work `components/ui` uses Radix to
            avoid. The browser gives it away free here.

            `sr-only` hides the input itself, not the control: the `<label>`
            wraps it, so clicking the pill activates the input, and
            `peer-checked:` styles the pill from the input's real state rather
            than from React's. `peer-focus-visible:` puts the focus ring on the
            visible pill, since the input has no box of its own. */}
        <fieldset className="flex flex-none gap-0.5 rounded-md bg-surface-primary p-0.5">
          <legend className="sr-only">Period</legend>
          {RANGES.map((r) => (
            <label key={r.days} className="cursor-pointer">
              <input
                type="radio"
                name="activity-period"
                className="sr-only peer"
                checked={days === r.days}
                onChange={() => setDays(r.days)}
                aria-label={`Last ${r.days} days`}
              />
              <span
                className="block rounded px-2 py-1 type-badge text-muted transition-colors
                           peer-checked:bg-surface-elevated peer-checked:text-strong
                           peer-focus-visible:ring-2 peer-focus-visible:ring-edge-focus
                           hover:text-primary"
              >
                {r.label}
              </span>
            </label>
          ))}
        </fieldset>
      </header>
      <div className="mx-4 border-t border-edge-subtle" />

      <div className="px-4 pt-4 pb-2">
        {/* `items-end` so every bar grows from a shared baseline. The columns
            are a grid rather than flex so an empty day still occupies its own
            slot — a gap is information, not a missing column. */}
        <div
          className="grid h-32 items-end gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
        >
          {columns.map(({ key, day }) => {
            const total = day?.totalSeconds ?? 0;
            const bands = stackFor(day?.byClient, inLegend);

            return (
              <div
                key={key}
                title={`${key} — ${total > 0 ? formatCompact(total) : 'nothing tracked'}`}
                className="flex h-full flex-col justify-end gap-px"
              >
                {bands.map(({ id, seconds }) => (
                  <div
                    key={id}
                    className="w-full rounded-[1.5px] first:rounded-t-[3px]"
                    style={{
                      /* Of the card's height, not of the bar: the stack has to
                         sum to the day's share of the peak. */
                      height: `${(seconds / peak) * 100}%`,
                      backgroundColor:
                        (id === INTERNAL ? null : clients.get(id)?.color) ??
                        NEUTRAL,
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Ends only. A label under every column is unreadable at 30 bars and
            the exact date lives in each column's tooltip. */}
        <div className="mt-2 flex justify-between type-meta text-subtle">
          <span>{monthDay(from, tz)}</span>
          <span>{monthDay(now, tz)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-edge-subtle px-4 py-2.5">
        {named.map((id) => (
          <Swatch
            key={id}
            colour={clients.get(id)?.color ?? NEUTRAL}
            label={clients.get(id)?.name ?? 'Unknown client'}
          />
        ))}
        {hasOther ? <Swatch colour={NEUTRAL} label="Other" /> : null}
        <span className="ml-auto type-meta text-subtle">
          {formatCompact(windowSeconds)} · {days} days
        </span>
      </div>
    </section>
  );
}

function Swatch({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 type-support text-muted">
      <span
        aria-hidden
        className="size-2 flex-none rounded-[2px]"
        style={{ backgroundColor: colour }}
      />
      {label}
    </span>
  );
}

/**
 * One day's seconds as stacked bands, largest-first from the top.
 *
 * Everything outside the legend — the long tail of clients and internal work —
 * merges into a single `INTERNAL` band so the column still totals the day's
 * real hours. Dropping them instead would make the bar lie about the day.
 */
function stackFor(
  byClient: Record<string, number> | undefined,
  inLegend: Set<string>,
): { id: string; seconds: number }[] {
  if (!byClient) return [];

  let other = 0;
  const named: { id: string; seconds: number }[] = [];
  for (const [id, seconds] of Object.entries(byClient)) {
    if (seconds <= 0) continue;
    if (inLegend.has(id)) named.push({ id, seconds });
    else other += seconds;
  }

  named.sort((a, b) => b.seconds - a.seconds);
  return other > 0 ? [...named, { id: INTERNAL, seconds: other }] : named;
}

function localKey(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function monthDay(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(at);
}
