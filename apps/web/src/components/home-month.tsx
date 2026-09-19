import Link from 'next/link';
import { formatCurrency } from '@stint/core';
import { CalendarDays, Pencil } from 'lucide-react';
import type { Pace, Stats } from '@/lib/client/api';
import { Region } from './home-shell';

/**
 * Month to date as a cumulative line against the goal ray.
 *
 * The gap between the two lines IS the delta — a distance you read rather
 * than a percentage you decode. With no target the region stays, carrying a
 * line that names what a goal is for and links to the field.
 */
export function Month({ stats }: { stats: Stats }) {
  const p = stats.pace;

  if (!p) {
    return (
      <Region title={monthName()} icon={CalendarDays} action={<EditGoal />}>
        <div className="px-5 pt-1 pb-3">
          <p className="type-support text-subtle">
            Set a monthly goal to track hours or revenue against it.
          </p>
        </div>
      </Region>
    );
  }

  /* No figure yet means no subject, so the region keeps a heading rather than
     demoting its title above an empty space. */
  if (p.actual == null) {
    return (
      <Region title={monthName()} icon={CalendarDays} action={<EditGoal />}>
        <div className="px-5 pt-1 pb-3">
          <p className="type-support text-subtle">
            A {p.unit} target is set, but pace in {p.unit} is not computed yet.
          </p>
        </div>
      </Region>
    );
  }

  const actual = p.actual;
  const isRevenue = p.unit === 'revenue';
  /** Money in the unit the target is in; hours keep one decimal and an `h`. */
  const fmt = (n: number) =>
    isRevenue ? formatCurrency(n, stats.currency) : `${n.toFixed(1)}h`;

  /* "Behind" is derived from BUSINESS days elapsed, not calendar days: a
     120-hour target is six hours a working day, and reading "behind" on a
     Monday because the weekend passed would be noise pretending to be
     signal. */
  const ahead = p.delta != null && p.delta >= 0;

  return (
    /* The only region with no figure, and deliberately: its answer is the
       SHAPE of the month against its goal, and a 30px total above the plot
       restates the fraction top-right while pulling the eye off the line
       that is doing the work. */
    <Region
      title={monthName()}
      icon={CalendarDays}
      labelled
      action={
        <EditGoal>
          {fmt(actual)} / {fmt(p.target)}
        </EditGoal>
      }
    >
      <div className="flex flex-col gap-2 px-5 pt-1 pb-3">
        <PaceLine
          series={p.series}
          target={p.target}
          ahead={ahead}
          label={`${fmt(actual)} of ${fmt(p.target)}`}
        />

        <div className="flex items-baseline justify-between gap-3">
          <p className="type-support text-subtle">
            {p.businessDaysElapsed} of {p.businessDaysTotal} business days
            {stats.billableRatio != null
              ? ` · ${Math.round(stats.billableRatio * 100)}% billable`
              : null}
          </p>
          {p.delta != null ? (
            <span
              className={`flex-none type-meta ${ahead ? 'text-muted' : 'text-warning'}`}
            >
              {ahead ? 'on pace' : 'behind'} {p.delta >= 0 ? '+' : ''}
              {fmt(p.delta)}
            </span>
          ) : null}
        </div>
      </div>
    </Region>
  );
}

/** Viewport of the pace plot, in its own units — the path is scaled by SVG. */
const PLOT_W = 300;
const PLOT_H = 104;

/**
 * The cumulative line against the goal ray, the gap between them shaded.
 *
 * `actual` is null beyond today (`PacePoint`), so the line stops where the
 * month does rather than flattening to the 31st, which would read as a month
 * that stopped working.
 *
 * `preserveAspectRatio="none"` — this is a plot, not a glyph: it stretches to
 * the region's width and the vertical scale is the one that carries meaning.
 */
function PaceLine({
  series,
  target,
  label,
  ahead,
}: {
  series: Pace['series'];
  target: number;
  label: string;
  /** Which side of the ray the line is on, which is what colours the gap. */
  ahead: boolean;
}) {
  if (series.length < 2) return null;

  /* The ray's end is the target, so the scale is the target unless the month
     ran past it — a line that leaves the top of the box would misreport a
     month that beat its goal. */
  const peak = Math.max(
    target,
    ...series.map((p) => p.actual ?? 0),
    ...series.map((p) => p.expected),
    1,
  );
  const x = (i: number) => (i / (series.length - 1)) * PLOT_W;
  const y = (v: number) => PLOT_H - (v / peak) * PLOT_H;

  const done = series.filter((p) => p.actual != null);
  const last = done.at(-1) ?? null;
  const actualPath = done
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.actual ?? 0)}`)
    .join(' ');
  const rayPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.expected)}`)
    .join(' ');

  /* The delta as a closed area: down the ray to today, back along the actual.
     The shape between the lines is the answer, so it is filled rather than
     left for the eye to measure. */
  const gap =
    done.length >= 2
      ? `${done.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.expected)}`).join(' ')} ` +
        `${[...done]
          .reverse()
          .map((p, i) => `L${x(done.length - 1 - i)},${y(p.actual ?? 0)}`)
          .join(' ')} Z`
      : null;

  return (
    <svg
      viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
      preserveAspectRatio="none"
      className="h-26 w-full"
      role="img"
      aria-label={label}
    >
      {/* The gap says which way it runs. Warning matches the "behind" figure
          below it, so the shape and the number agree. Ahead takes `info`, not
          `success`: success is reserved for an outcome, and a month that is
          ahead on the 13th can be behind on the 14th. */}
      {gap ? (
        /* Two opacities, not one: `info` is a muted blue and `warning` a
           bright amber, so the same alpha puts the blue 30% weaker against
           the panel (OKLCH ΔL 0.076 vs 0.109). These land both near 0.11, so
           the gap carries the same weight whichever way the month is going. */
        <path
          d={gap}
          fill={ahead ? 'var(--color-info)' : 'var(--color-warning)'}
          opacity={ahead ? '0.26' : '0.18'}
        />
      ) : null}
      {/* The ray is the reference, so it recedes: dashed and quiet. */}
      <path
        d={rayPath}
        fill="none"
        stroke="var(--color-subtle)"
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      {/* The subject of the region, so it carries the weight the figure used
          to. Neutral, never the accent: the accent is the running timer. */}
      <path
        d={actualPath}
        fill="none"
        stroke="var(--color-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Today. Without it the line reads as having run out of data rather
          than as having reached the present. */}
      {last ? (
        /* A zero-length round-capped stroke, not a <circle>: the plot sets
           `preserveAspectRatio="none"`, so x and y scale by different factors
           and a circle renders as a squashed ellipse. A cap is drawn in stroke
           space, which `vectorEffect` keeps round. */
        <path
          d={`M${x(done.length - 1)},${y(last.actual ?? 0)} l0,0`}
          stroke="var(--color-strong)"
          strokeWidth="6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

/**
 * Into the goal field in Settings. A link, not a dialog: Settings owns the
 * field, and a second editor here is a second place to look when the number is
 * wrong.
 *
 * The figure is the link once there is one, rather than a pencil beside it: a
 * control that only edits the number next to it says nothing the number
 * cannot, and the header is where the region's one quiet control sits.
 */
function EditGoal({ children }: { children?: React.ReactNode }) {
  return (
    <Link
      href="/settings#goal"
      aria-label="Edit monthly goal"
      className="-my-1 rounded-sm type-meta whitespace-nowrap text-subtle hover:text-muted hover:underline hover:decoration-edge-subtle hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
    >
      {children ?? <Pencil aria-hidden strokeWidth={1.75} className="size-4" />}
    </Link>
  );
}

/* Browser locale, like the day and date in `PanelHead` and the dates in the
   entry list: a heading that says "September" beside a date that says
   "17 sept." is the app disagreeing with itself. */
function monthName() {
  return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(
    new Date(),
  );
}
