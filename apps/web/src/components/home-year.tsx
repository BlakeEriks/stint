import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  formatCompact,
  localDateKey,
  startOfLocalDayOffset,
} from '@stint/core';
import { CalendarDays } from 'lucide-react';
import { api } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import { keys } from '@/lib/client/query-keys';
import { type Clients, Region } from './home-shell';

/** Internal work: no client, so no hue — but not rest either. */
const INTERNAL = '';

/**
 * Half a year of columns.
 *
 * The region shares its row with By project now, so 52 columns would draw the
 * cell at half the size it needs to read as a cell. Half the window at full
 * size says more than a full one reduced to a texture.
 */
const WEEKS = 26;
const DAYS = WEEKS * 7;

/**
 * Half a year of days: when the work happened, and whose it was.
 *
 * **Hue is the client**, resolved as everywhere else and never the accent;
 * **density is the hours**. A blank day stays blank — a weekend is
 * information, not missing data.
 *
 * A day split across clients takes the one with the most hours. A cell is
 * ~12px and cannot carry a stack; the alternative is a smear of colour that
 * names nobody.
 */
export function Heatmap({ clients }: { clients: Clients }) {
  /* Taken once, so `from` and `to` are the same instants on every render.
     Read inline they drifted by milliseconds while the cache key stayed
     fixed — a stable cache key over a moving request. */
  const now = useMemo(() => new Date(), []);
  const from = useMemo(() => startOfLocalDayOffset(now, tz, DAYS - 1), [now]);

  const { data } = useQuery({
    queryKey: keys.heatmap(tz, DAYS),
    queryFn: () =>
      api.activity({ from: from.toISOString(), to: now.toISOString(), tz }),
  });

  /* Every cell and the legend behind them, derived once per response.
     Unmemoised this ran a date conversion per day plus four passes over them
     on every beat, every tick and every refetch of anything on the panel. */
  const view = useMemo(() => {
    if (!data) return null;

    const byDate = new Map(data.days.map((d) => [d.date, d]));

    /* Every day in the range gets a cell, present in the response or not, so
       a gap is a day nobody worked rather than a column that quietly closed
       up. */
    const cells = Array.from({ length: DAYS }, (_, i) => {
      const at = startOfLocalDayOffset(now, tz, DAYS - 1 - i);
      const key = localDateKey(at, tz);
      return { key, day: byDate.get(key) };
    });

    /* The busiest day sets the density scale, so it rebases with the window:
       the same day reads darker over six months than it did over twelve. A
       fixed ceiling would flatten a quiet stretch into nothing. */
    const peak = Math.max(...cells.map((c) => c.day?.totalSeconds ?? 0), 1);
    const windowSeconds = cells.reduce(
      (sum, c) => sum + (c.day?.totalSeconds ?? 0),
      0,
    );

    /* Ranked over the whole window, not per week, so the legend names the
       clients the half-year was actually spent on. */
    const totals = new Map<string, number>();
    for (const { day } of cells) {
      for (const [id, seconds] of Object.entries(day?.byClient ?? {})) {
        totals.set(id, (totals.get(id) ?? 0) + seconds);
      }
    }
    const named = [...totals.entries()]
      .filter(([id, seconds]) => id !== INTERNAL && seconds > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
    const inLegend = new Set(named);
    const hasOther = [...totals.entries()].some(
      ([id, seconds]) => seconds > 0 && !inLegend.has(id),
    );

    return { cells, peak, windowSeconds, named, inLegend, hasOther };
  }, [data, now]);

  if (!view) return null;

  const { cells, peak, windowSeconds, named, inLegend, hasOther } = view;

  return (
    <Region
      title="Last 6 months"
      icon={CalendarDays}
      action={
        /* `whitespace-nowrap`: the heading beside it is `flex-1`, so at a
           narrow width the streak is what gives, and "34 day / streak" over
           two lines reads as a figure that outgrew its slot. */
        <span className="type-meta whitespace-nowrap text-subtle">
          {streakLabel(cells)}
        </span>
      }
    >
      <div className="px-5 pt-1 pb-3">
        {/* Columns are weeks, rows are weekdays — the layout every calendar
            heatmap uses, so the shape is readable without a key. `grid-flow-col`
            fills down each week before moving right. */}
        <div
          className="grid grid-flow-col grid-rows-7 gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
        >
          {cells.map(({ key, day }) => {
            const total = day?.totalSeconds ?? 0;
            const id = dominantClient(day?.byClient);
            const colour =
              id == null
                ? null
                : ((id === INTERNAL || !inLegend.has(id)
                    ? null
                    : clients.get(id)?.color) ?? INTERNAL_SWATCH);

            return (
              <div
                key={key}
                title={`${key} — ${total > 0 ? formatCompact(total) : 'nothing tracked'}`}
                className="aspect-square rounded-[2px]"
                style={
                  colour == null
                    ? /* A blank day is the surface it sits on, not a grey
                         chip: the panel's own ground is what says "nothing
                         happened" without drawing a mark for it. */
                      { backgroundColor: 'var(--color-surface-hover)' }
                    : {
                        backgroundColor: colour,
                        /* Density, floored so the lightest worked day is
                           still visibly a day worked. */
                        opacity: 0.25 + 0.75 * Math.min(1, total / peak),
                      }
                }
              />
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {named.map((id) => (
            <Swatch
              key={id}
              colour={clients.get(id)?.color ?? INTERNAL_SWATCH}
              label={clients.get(id)?.name ?? 'Unknown client'}
            />
          ))}
          {hasOther ? <Swatch colour={INTERNAL_SWATCH} label="Other" /> : null}
          <span className="ml-auto type-meta text-subtle">
            {formatCompact(windowSeconds)}
          </span>
        </div>
      </div>
    </Region>
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
 * The client a day mostly belonged to, or null if nothing was tracked.
 *
 * Ties break on the id so a day split exactly in half keeps the same colour
 * between renders — a cell that flickers between two hues on refetch reads as
 * a bug in the data.
 */
function dominantClient(
  byClient: Record<string, number> | undefined,
): string | null {
  if (!byClient) return null;
  let best: string | null = null;
  let bestSeconds = 0;
  for (const [id, seconds] of Object.entries(byClient)) {
    if (seconds <= 0) continue;
    if (
      seconds > bestSeconds ||
      (seconds === bestSeconds && id < (best ?? ''))
    ) {
      best = id;
      bestSeconds = seconds;
    }
  }
  return best;
}

/**
 * Consecutive worked days back from today, forgiving exactly one gap.
 *
 * A streak that breaks on a single missed day punishes a dentist appointment
 * and stops being a figure anyone trusts. Two missed days is a stop.
 *
 * Today not yet worked does not break it — the day is still in progress.
 */
function streakLabel(cells: { day?: { totalSeconds: number } }[]): string {
  const worked = cells.map((c) => (c.day?.totalSeconds ?? 0) > 0);

  let streak = 0;
  let skipped = 0;
  for (let i = worked.length - 1; i >= 0; i--) {
    if (worked[i]) {
      streak++;
      skipped = 0;
      continue;
    }
    // Today in progress is not a miss; it has not had its chance yet.
    if (i === worked.length - 1) continue;
    skipped++;
    if (skipped > 1) break;
  }

  return streak > 0 ? `${streak} day streak` : 'no streak';
}
