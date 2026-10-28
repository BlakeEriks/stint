'use client';

import { formatCurrency, type MonthPlot, monthChart } from '@stint/core';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Stats } from '@/lib/client/api';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import { Money } from './money';
import {
  FigGroup,
  FigLabel,
  type Hue,
  INTERNAL,
  RegionHead,
} from './home-shell';

/** The climb's viewport, in its own units — the paths are scaled by SVG. */
const PLOT_W = 300;
const PLOT_H = 200;

/**
 * This month: three figures beside the cumulative climb.
 *
 * Earned is the screen's subject and the series the projection extrapolates;
 * On track for and Unbilled are two narrower readings taken from the month's
 * money. They are never summed: Unbilled is part of Earned, and On track for
 * is Earned projected. Earned buckets by when the work was done, never when it
 * was invoiced or paid, so sending an invoice doesn't move it. Unbilled is a
 * balance that resets on invoicing, which is why it's a reading, not the
 * headline.
 */
export function Month({
  stats,
  hues,
}: {
  stats: Stats;
  /** The panel's one palette, so a band matches its bar and its key. */
  hues: Map<string, Hue>;
}) {
  const { month, currency, unbilled } = stats;
  const chart = monthChart(month);

  return (
    <div className="mt-6 border-t border-edge-subtle pt-6">
      <div className="grid items-start gap-8 @2xl:grid-cols-[17.5rem_minmax(0,1fr)]">
        <div className="flex flex-col">
          <RegionHead>This month · {monthName()}</RegionHead>

          {/* No hours beside this figure: `month` carries no seconds, and
              `unbilled.seconds` is a different window — an all-time balance
              rather than the month — so printing it here would label one
              period's hours with another's. */}
          <FigGroup tier="hero" className="mt-6">
            <FigLabel>Earned</FigLabel>
            <Money
              figure="month-earned"
              amount={month.earned}
              currency={currency}
              className="type-figure-hero text-strong"
            />
          </FigGroup>

          {/* Spacing alone carries the split: Earned is the month's subject,
              the two below are readings taken from it. A rule here would read
              as a section boundary, which is not what this is. */}
          <FigGroup tier="minor" className="mt-[26px]">
            <FigLabel>On track for</FigLabel>
            {chart.projection.state === 'figure' ? (
              <Money
                figure="month-projected"
                amount={chart.projection.amount}
                currency={currency}
                className="type-amount-hero text-strong"
              />
            ) : (
              <span
                data-projection="pending"
                role="img"
                aria-label="Not projected yet"
                className="type-amount-hero text-subtle"
              >
                —
              </span>
            )}
          </FigGroup>

          <FigGroup tier="minor" className="mt-[22px]">
            <FigLabel>Unbilled</FigLabel>
            <Money
              figure="month-unbilled"
              amount={unbilled.total}
              currency={currency}
              className="type-amount-hero text-strong"
            />
            {unbilled.mixed ? (
              <span className="type-meta text-subtle">
                Other currencies not included
              </span>
            ) : null}
          </FigGroup>

          {/* Awaiting counts rather than describes, and is rendered only when
              there is something to count. Never summed with unbilled: one has
              an invoice and a due date, the other can still be written off. */}
          {stats.awaitingPayment > 0 ? (
            <p className="mt-[22px] type-meta text-subtle">
              {formatCurrency(stats.awaitingPayment, currency)} awaiting ·{' '}
              {stats.openInvoiceCount} open invoice
              {stats.openInvoiceCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>

        <Climb
          month={month}
          plot={chart.plot}
          currency={currency}
          hues={hues}
        />
      </div>
    </div>
  );
}

/**
 * The month's client split, on the plot's own x-axis.
 *
 * MONEY, where the week's bars are seconds: the month's subject is Earned, so
 * its split divides what was earned. It answers WHO the month came from,
 * which the line cannot — two identical climbs, one from a single client and
 * one from four, are different months to be in.
 *
 * Inset to the plot's own axis so it reads as a footing for the line rather
 * than a second chart.
 */
function Strip({
  byClient,
  hues,
  currency,
}: {
  byClient: Stats['month']['byClient'];
  hues: Map<string, Hue>;
  currency: string;
}) {
  const total = byClient.reduce((sum, c) => sum + c.amount, 0);
  /* No money, no split. A strip of one neutral band would claim a month came
     from nobody, where the honest reading is that it has not earned yet. */
  if (total <= 0) return null;

  /* Walked in the palette's order rather than the field's, so a band sits
     where its key and its bar segment do. */
  const bands = [...hues.entries()]
    .map(([key, hue]) => ({
      hue,
      amount:
        byClient.find((c) => (c.clientId ?? INTERNAL) === key)?.amount ?? 0,
    }))
    .filter((b) => b.amount > 0);

  return (
    <div
      data-strip="clients"
      role="img"
      aria-label={stripLabel(bands, total, currency)}
      className="mt-2.5 mr-3.5 ml-11 flex h-1 overflow-hidden rounded-sm"
    >
      {bands.map((b) => (
        <span
          key={b.hue.id || 'internal'}
          data-band={b.hue.id || 'internal'}
          style={{
            width: `${(b.amount / total) * 100}%`,
            backgroundColor: b.hue.color ?? INTERNAL_SWATCH,
          }}
          className="block h-full flex-none"
        />
      ))}
    </div>
  );
}

/** The strip's one alt text: who the month came from, and how much of it. */
function stripLabel(
  bands: { hue: Hue; amount: number }[],
  total: number,
  currency: string,
): string {
  return bands
    .map(
      (b) =>
        `${b.hue.name} ${formatCurrency(b.amount, currency)}, ${Math.round(
          (b.amount / total) * 100,
        )}%`,
    )
    .join('; ');
}

/**
 * Earnings accumulated day by day, solid to today and dashed to where the
 * trailing pace lands.
 *
 * The shape is the argument for the projection: a line that has been climbing
 * makes its continuation believable. The line only ever goes up.
 *
 * Axis labels are drawn in HTML OUTSIDE the stretched viewBox, so
 * `preserveAspectRatio="none"` cannot distort the type.
 */
function Climb({
  month,
  plot,
  currency,
  hues,
}: {
  month: Stats['month'];
  plot: MonthPlot | null;
  currency: string;
  hues: Map<string, Hue>;
}) {
  if (!plot) {
    return (
      <div className="min-w-0">
        <div
          data-climb="empty"
          className="flex min-h-[230px] items-center type-meta text-subtle"
        >
          The month&apos;s climb draws once there are two days on it.
        </div>
        {/* The split still answers WHO on a month too young to draw a line:
            one day of work has no shape, but it already has a source. */}
        <Strip byClient={month.byClient} hues={hues} currency={currency} />
      </div>
    );
  }

  const at = ({ x, y }: { x: number; y: number }) =>
    `${x * PLOT_W},${PLOT_H - y * PLOT_H}`;
  const line = plot.solid
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${at(p)}`)
    .join(' ');
  const { today } = plot;
  const area = `${line} L${at({ x: today.x, y: 0 })} L0,${PLOT_H} Z`;
  const dashed = plot.dashed
    ? `M${at(plot.dashed[0])} L${at(plot.dashed[1])}`
    : null;
  const end = plot.dashed?.[1];

  return (
    <div className="min-w-0">
      <div className="relative pr-3.5 pl-11">
        <div className="relative min-h-[230px] w-full aspect-[16/9.2]">
          <svg
            viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
            preserveAspectRatio="none"
            className="block h-full w-full overflow-visible"
            role="img"
            aria-label={label(month, currency)}
          >
            {plot.gridlines.map((v) => {
              const y = PLOT_H - (v / plot.top) * PLOT_H;
              return (
                <line
                  key={v}
                  x1="0"
                  y1={y}
                  x2={PLOT_W}
                  y2={y}
                  strokeWidth="1"
                  className="stroke-edge-grid"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            <path d={area} className="fill-strong opacity-[0.07]" />
            <path
              d={line}
              fill="none"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-strong"
              vectorEffect="non-scaling-stroke"
            />

            {/* The projection recedes: dashed, and at the same hue as the line
                it continues. It is the one forward-looking figure here. */}
            {dashed ? (
              <path
                data-projection="line"
                d={dashed}
                fill="none"
                strokeWidth="1.75"
                strokeDasharray="5 4"
                strokeLinecap="round"
                className="stroke-strong opacity-[0.38]"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {/* Today. A zero-length round-capped stroke, not a <circle>: the
                plot sets `preserveAspectRatio="none"`, so x and y scale by
                different factors and a circle renders as a squashed ellipse.
                A cap is drawn in stroke space, which `vectorEffect` keeps
                round. */}
            <path
              d={`M${at(today)} l0,0`}
              strokeWidth="6.5"
              strokeLinecap="round"
              className="stroke-strong"
              vectorEffect="non-scaling-stroke"
            />

            {/* `success` marks ONE thing on this screen: the endpoint of the
                projection. The accent appears nowhere here — it is spent on
                the running timer in the bar below. */}
            {end ? (
              <path
                data-projection="end"
                d={`M${at(end)} l0,0`}
                strokeWidth="7.5"
                strokeLinecap="round"
                className="stroke-success"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          <div data-axis="y" className="absolute inset-y-0 -left-11 w-11">
            {plot.gridlines.map((v) => (
              <span
                key={v}
                style={{ top: `${(1 - v / plot.top) * 100}%` }}
                className="absolute left-0 -translate-y-1/2 type-meta whitespace-nowrap text-subtle"
              >
                {compact(v, currency)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The strip sits between the plot and its labels, on the plot's own
          axis: a footing for the line, not a second chart. */}
      <Strip byClient={month.byClient} hues={hues} currency={currency} />

      <DayAxis
        first={dayLabel(month.series[0]?.date)}
        end={dayLabel(month.series.at(-1)?.date)}
        today={today}
      />
    </div>
  );
}

/** The space `today` keeps from a date label, in px. */
const AXIS_GAP = 8;

/**
 * The x axis: the month's first and last dates at its ends, and `today` at
 * its day. A date that `today` would touch gives way to it, so near either end
 * `today` takes that date's place. Whether they touch is measured, not
 * computed, since it turns on the axis's width and the locale's dates.
 */
function DayAxis({
  first,
  end,
  today: { x: at, anchor },
}: {
  first: string;
  end: string;
  today: MonthPlot['today'];
}) {
  const row = useRef<HTMLDivElement>(null);
  const [yields, setYields] = useState({ first: false, end: false });

  // biome-ignore lint/correctness/useExhaustiveDependencies: the labels move and change without the row resizing, so a new day or locale remeasures
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const box = (name: string) =>
        el
          .querySelector(`[data-axis-label="${name}"]`)
          ?.getBoundingClientRect();
      const today = box('today');
      const a = box('first');
      const b = box('end');
      if (!today || !a || !b) return;
      setYields({
        first: today.left < a.right + AXIS_GAP,
        end: today.right > b.left - AXIS_GAP,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [first, end, at]);

  return (
    <div ref={row} data-axis="x" className="relative mt-2.5 mr-3.5 ml-11 h-4">
      {/* `invisible`, not removed, so the label is still there to measure
          once `today` moves off it. */}
      <span
        data-axis-label="first"
        className={`absolute left-0 type-meta whitespace-nowrap text-subtle ${yields.first ? 'invisible' : ''}`}
      >
        {first}
      </span>
      <span
        data-axis-label="today"
        style={{ left: `${at * 100}%` }}
        className={`absolute ${anchor === 'end' ? '-translate-x-full' : '-translate-x-1/2'} type-meta whitespace-nowrap text-primary`}
      >
        today
      </span>
      <span
        data-axis-label="end"
        className={`absolute left-full -translate-x-full type-meta whitespace-nowrap text-subtle ${yields.end ? 'invisible' : ''}`}
      >
        {end}
      </span>
    </div>
  );
}

/**
 * `$350`, `$1.05k`, `$10.5k` — an axis label. Every label is a multiple of a
 * round step, so two decimals hold it exactly; `Number` drops trailing zeros.
 */
function compact(v: number, currency: string): string {
  const symbol = formatCurrency(0, currency).replace(/[\d.,]/g, '');
  return v >= 1000
    ? `${symbol}${Number((v / 1000).toFixed(2))}k`
    : `${symbol}${Number(v.toFixed(2))}`;
}

function label(month: Stats['month'], currency: string): string {
  const earned = `${formatCurrency(month.earned, currency)} over ${
    month.businessDaysElapsed
  } of ${month.businessDaysTotal} working days`;
  return month.projection
    ? `${monthName()} earnings climbing to ${earned}, projecting ${formatCurrency(
        month.projection.to.amount,
        currency,
      )}`
    : `${monthName()} earnings climbing to ${earned}`;
}

/** `Sep 1`. Built as UTC, so no zone can shift the key a day. */
function dayLabel(key: string | undefined): string {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

/* Browser locale, like every other date on this screen. */
function monthName(): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(
    new Date(),
  );
}
