'use client';

import { formatCompact, formatCurrency, localDateKey } from '@stint/core';
import type { Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import { Money } from './money';
import {
  FigGroup,
  FigLabel,
  type Hue,
  PairLine,
  RegionHead,
} from './home-shell';

/**
 * How much of the track the week's longest day fills.
 *
 * The scale is the week's OWN longest day, not a notional full one: there is
 * no "full" day for a ceiling to represent. Heights stay a true ratio of
 * hours; only what 100% means changes. The 6% headroom is where the tallest
 * bar's money is printed.
 */
const PEAK = 94;

/**
 * This week: a figure and seven bars.
 *
 * The wide two thirds of the top row — seven columns and their captions need
 * the long axis (`docs/design/screens/home.html`).
 */
export function Week({
  stats,
  hues,
  byDay,
}: {
  stats: Stats;
  /** The panel's one palette, in the one order every region walks. */
  hues: Map<string, Hue>;
  /** Seconds per client per local day, from `/calendar?granularity=day`. */
  byDay: Map<string, Record<string, number>>;
}) {
  const { week, currency } = stats;

  const seconds = week.reduce((sum, d) => sum + d.seconds, 0);
  /* Null amounts are days of purely unrated work: they have a real height and
     no money to print, so they add nothing to the total rather than zero. */
  const earned = week.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  const today = localDateKey(new Date(), tz);
  const longest = Math.max(...week.map((d) => d.seconds), 0);

  return (
    <div data-region="week" className="flex flex-col">
      <RegionHead>This week · {range(week)}</RegionHead>

      <FigGroup tier="major" className="mt-6 items-start">
        <FigLabel>Earned</FigLabel>
        <PairLine>
          <Money
            amount={earned}
            currency={currency}
            className="type-figure text-strong"
          />
          <span className="type-duration text-subtle">
            {formatCompact(seconds)}
          </span>
        </PairLine>
      </FigGroup>

      <div className="mt-6" role="img" aria-label={describe(week, currency)}>
        {/* The bars stand on a baseline. There is no ceiling: the axis is
            unlabelled and each bar prints its own money, so every column is
            read on its own terms. */}
        <div className="flex h-[150px] items-stretch gap-4 border-b border-edge-default">
          {week.map((d) => (
            <div key={d.date} className="flex min-w-0 flex-1">
              <div className="relative mx-auto flex w-full max-w-[74px] min-h-0 flex-1 flex-col-reverse">
                {/* A day with no work draws NO bar — the caption's em-dash is
                    what says so. A zero-height element with a background
                    would still paint its radius. */}
                {d.seconds > 0 && longest > 0 ? (
                  <i
                    data-bar={d.date}
                    className="relative block w-full flex-none rounded-t-[5px] opacity-85"
                    style={{ height: `${(d.seconds / longest) * PEAK}%` }}
                  >
                    {/* The stack, bottom-up in the legend's own order. Each
                        segment is a SHARE OF THE DAY'S SECONDS, never of its
                        money: a segment sized by money would make an
                        expensive hour taller than a cheap one and break the
                        ratio the bar exists to show. */}
                    <span className="absolute inset-0 flex flex-col-reverse overflow-hidden rounded-t-[5px]">
                      {segments(byDay.get(d.date), hues, d.seconds).map((s) => (
                        <span
                          key={s.id || 'internal'}
                          data-segment={s.id || 'internal'}
                          data-day={d.date}
                          style={{
                            height: `${s.share * 100}%`,
                            /* Only clients have a colour. Internal work takes
                               the neutral, the same absence the hollow ring
                               draws in a row. */
                            backgroundColor: s.color ?? INTERNAL_SWATCH,
                          }}
                          className="block w-full flex-none"
                        />
                      ))}
                    </span>

                    {/* Money rides the bar it describes, at that bar's own
                        head: inside the column it cannot be misread as
                        belonging to the day beside it, and the caption below
                        stays two lines rather than three. It is the day's
                        TOTAL — the stack divides hours, not this figure. */}
                    {d.amount != null ? (
                      <span className="absolute inset-x-0 bottom-full mb-1.5 text-center type-meta whitespace-nowrap text-subtle">
                        {formatCurrency(d.amount, currency)}
                      </span>
                    ) : null}
                  </i>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-4">
          {week.map((d) => {
            const rest = d.seconds === 0;
            return (
              <div
                key={d.date}
                className="flex min-w-0 flex-1 flex-col items-center gap-[5px]"
              >
                {/* Hours LEAD: the bar's height is hours, so the number
                    matching what is drawn takes the weight. A day with no
                    work keeps this line as an em-dash, which is what holds
                    every weekday label on one baseline. */}
                <span
                  className={`text-center type-amount whitespace-nowrap ${
                    rest ? 'text-subtle' : 'text-primary'
                  }`}
                >
                  {rest ? '—' : formatCompact(d.seconds)}
                </span>
                {/* Today carries weight as well as colour: colour alone puts
                    the weight of the distinction on the one channel a
                    colour-blind reader may not have. */}
                <span
                  className={`text-center ${
                    d.date === today
                      ? 'type-meta-strong text-primary'
                      : 'type-meta text-subtle'
                  }`}
                >
                  {weekday(d.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * A day's stack: one segment per client, sized by that client's SECONDS.
 *
 * Walked in the palette's own order, so the same client sits at the same
 * point of every bar and matches its band in the strip below.
 *
 * Shares are taken against the day's OWN summed seconds rather than against
 * `/stats.week`'s: the two rollups filter differently — the bar's height
 * counts billable work, and this call counts what was tracked — so dividing
 * by the other's total would leave a stack that does not fill its bar.
 *
 * Until `/calendar` answers there is one neutral segment filling the bar:
 * the height is already correct from `/stats`, and a bar that draws nothing
 * while its split loads would read as a day that was not worked.
 */
function segments(
  byClient: Record<string, number> | undefined,
  hues: Map<string, Hue>,
  fallbackSeconds: number,
): { id: string; color: string | null; share: number }[] {
  const total = byClient
    ? Object.values(byClient).reduce((sum, s) => sum + s, 0)
    : 0;
  if (!byClient || total <= 0) {
    return [{ id: '', color: null, share: fallbackSeconds > 0 ? 1 : 0 }];
  }

  const out: { id: string; color: string | null; share: number }[] = [];
  for (const [key, hue] of hues) {
    const seconds = byClient[key] ?? 0;
    if (seconds <= 0) continue;
    out.push({ id: key, color: hue.color, share: seconds / total });
  }
  return out;
}

/** `MON`. Built as UTC so no zone can shift the key a day. */
function weekday(key: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(asUtc(key))
    .toUpperCase();
}

/** `Sep 14–20`, the week's own span. */
function range(week: Stats['week']): string {
  const first = week[0];
  const last = week.at(-1);
  if (!first || !last) return '';

  const fmt = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const end = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${fmt.format(asUtc(first.date))}–${end.format(asUtc(last.date))}`;
}

/** The plot's one alt text: seven days, their hours and their money. */
function describe(week: Stats['week'], currency: string): string {
  return week
    .map((d) => {
      const day = weekday(d.date);
      if (d.seconds === 0) return `${day} not yet worked`;
      const money =
        d.amount != null ? ` ${formatCurrency(d.amount, currency)}` : '';
      return `${day} ${formatCompact(d.seconds)}${money}`;
    })
    .join(', ');
}

function asUtc(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}
