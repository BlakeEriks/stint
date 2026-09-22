'use client';

import { formatCurrency } from '@stint/core';
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

/** Four value gridlines, so the climb is read against something. */
const GRIDLINES = 4;

/**
 * This month: three figures beside the cumulative climb.
 *
 * Earned is the screen's subject and the series the projection extrapolates;
 * On track for and Unbilled are two narrower readings taken from the month's
 * money (`docs/design/screens/home.html`).
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

  return (
    <div className="mt-6 border-t border-edge-subtle pt-6">
      <div className="grid items-start gap-8 @2xl:grid-cols-[17.5rem_minmax(0,1fr)]">
        <div className="flex flex-col">
          <RegionHead>This month · {monthName()}</RegionHead>

          {/* No hours beside this figure: `month` carries no seconds, and
              `unbilled.seconds` is a different window — an all-time balance
              rather than the month — so printing it here would label one
              period's hours with another's. `docs/roadmap.md` carries the
              field. */}
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
            {/* Null until three business days have elapsed: earned-so-far over
                one elapsed day carried across twenty-two is a figure that
                swings by thousands, so it is withheld rather than guessed. */}
            {month.projected != null ? (
              <Money
                figure="month-projected"
                amount={month.projected}
                currency={currency}
                className="type-amount-hero text-strong"
              />
            ) : (
              <span data-projection="pending" className="type-meta text-subtle">
                after {month.businessDaysElapsed} of 3 business days
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

        <Climb month={month} currency={currency} hues={hues} />
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
 * than a second chart (`docs/design/screens/home.html`).
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
  currency,
  hues,
}: {
  month: Stats['month'];
  currency: string;
  hues: Map<string, Hue>;
}) {
  const done = month.series.filter((p) => p.actual != null);
  if (done.length < 2) {
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

  const proj = month.projection;
  /* The scale takes the projection's endpoint when there is one, so the dashed
     segment lands inside the box rather than leaving the top of it. */
  const peak = Math.max(
    ...done.map((p) => p.actual ?? 0),
    proj?.to.amount ?? 0,
    1,
  );

  /* The x axis is the whole month, so the solid line stops where the month
     does rather than stretching to fill the box — which would draw a finished
     month on the 13th. */
  const total = Math.max(month.series.length - 1, 1);
  const x = (i: number) => (i / total) * PLOT_W;
  const y = (v: number) => PLOT_H - (v / peak) * PLOT_H;

  const line = done
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.actual ?? 0)}`)
    .join(' ');
  const last = done.length - 1;
  const area = `${line} L${x(last)},${PLOT_H} L0,${PLOT_H} Z`;

  const dashed = proj
    ? `M${x(last)},${y(proj.from.amount)} L${PLOT_W},${y(proj.to.amount)}`
    : null;

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
            {Array.from({ length: GRIDLINES }, (_, i) => {
              const v = (peak / (GRIDLINES + 1)) * (i + 1);
              return (
                <line
                  key={i}
                  x1="0"
                  y1={y(v)}
                  x2={PLOT_W}
                  y2={y(v)}
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
              d={`M${x(last)},${y(done[last]?.actual ?? 0)} l0,0`}
              strokeWidth="6.5"
              strokeLinecap="round"
              className="stroke-strong"
              vectorEffect="non-scaling-stroke"
            />

            {/* `success` marks ONE thing on this screen: the endpoint of the
                projection. The accent appears nowhere here — it is spent on
                the running timer in the bar below. */}
            {proj ? (
              <path
                data-projection="end"
                d={`M${PLOT_W},${y(proj.to.amount)} l0,0`}
                strokeWidth="7.5"
                strokeLinecap="round"
                className="stroke-success"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          <div className="absolute inset-y-0 -left-11 w-11">
            {Array.from({ length: GRIDLINES }, (_, i) => {
              const v = (peak / (GRIDLINES + 1)) * (i + 1);
              return (
                <span
                  key={i}
                  style={{ top: `${(1 - v / peak) * 100}%` }}
                  className="absolute left-0 -translate-y-1/2 type-meta whitespace-nowrap text-subtle"
                >
                  {compact(v, currency)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* The strip sits between the plot and its labels, on the plot's own
          axis: a footing for the line, not a second chart. */}
      <Strip byClient={month.byClient} hues={hues} currency={currency} />

      <div className="relative mt-2.5 mr-3.5 ml-11 h-4">
        <span className="absolute left-0 type-meta whitespace-nowrap text-subtle">
          {dayLabel(month.series[0]?.date)}
        </span>
        <span
          style={{ left: `${(last / total) * 100}%` }}
          className="absolute -translate-x-1/2 type-meta whitespace-nowrap text-primary"
        >
          today
        </span>
        <span className="absolute left-full -translate-x-full type-meta whitespace-nowrap text-subtle">
          {dayLabel(month.series.at(-1)?.date)}
        </span>
      </div>
    </div>
  );
}

/** `$10k`, `$7.5k` — an axis label, not an amount to be read exactly. */
function compact(v: number, currency: string): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `${formatCurrency(0, currency).replace(/[\d.,]/g, '')}${
      k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')
    }k`;
  }
  return formatCurrency(Math.round(v), currency);
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
