/**
 * The month chart's layout, as data: the home screen draws it and decides
 * nothing. Coordinates are fractions of the plot, `y` measured up from its
 * floor, so the client scales them to whatever box it draws in.
 */

import type { buildEarnedPace } from './stats.ts';

type EarnedPace = ReturnType<typeof buildEarnedPace>;

/** Four value gridlines, so the climb is read against something. */
const GRIDLINES = 4;

/**
 * Gridline steps a reader can add up at a glance, per power of ten. No step is
 * more than 1.25× the one before, so at most a fifth of the plot sits empty
 * above the peak.
 */
const NICE = [1, 1.2, 1.5, 1.8, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10];

export interface ChartPoint {
  x: number;
  y: number;
}

export interface MonthPlot {
  /** The value at the plot's top, which is also the top gridline's. */
  top: number;
  /** Gridline values, bottom to top. */
  gridlines: number[];
  /** Cumulative earned, one point per business day up to today. */
  solid: ChartPoint[];
  /** Today to the projected month end; null with no projection. */
  dashed: [ChartPoint, ChartPoint] | null;
  /** The solid line's last point. On the axis's last day its label anchors
   *  flush at the end rather than hanging half past it. */
  today: ChartPoint & { anchor: 'middle' | 'end' };
}

export interface MonthChart {
  projection: { state: 'figure'; amount: number } | { state: 'pending' };
  /** Null until two days are on the line: one point has no shape. */
  plot: MonthPlot | null;
}

export function monthChart(
  month: Pick<EarnedPace, 'projected' | 'series' | 'projection'>,
): MonthChart {
  return {
    projection:
      month.projected == null
        ? { state: 'pending' }
        : { state: 'figure', amount: month.projected },
    plot: monthPlot(month),
  };
}

function monthPlot({
  series,
  projection,
}: Pick<EarnedPace, 'series' | 'projection'>): MonthPlot | null {
  const done = series.flatMap((p) => (p.actual == null ? [] : [p.actual]));
  if (done.length < 2) return null;

  /* The scale takes the projection's endpoint when there is one, so the
     dashed segment lands inside the box rather than leaving the top of it. */
  const top = scaleTop(Math.max(...done, projection?.to.amount ?? 0));

  /* The x axis is the whole month, so the solid line stops where the month
     does rather than stretching to fill the box — which would draw a
     finished month on the 13th. */
  const span = Math.max(series.length - 1, 1);
  const solid = done.map((v, i) => ({ x: i / span, y: v / top }));
  const today = solid.at(-1) as ChartPoint;

  return {
    top,
    gridlines: Array.from(
      { length: GRIDLINES },
      (_, i) => (top / GRIDLINES) * (i + 1),
    ),
    solid,
    dashed: projection
      ? [
          { x: today.x, y: projection.from.amount / top },
          { x: 1, y: projection.to.amount / top },
        ]
      : null,
    today: { ...today, anchor: today.x >= 1 ? 'end' : 'middle' },
  };
}

/**
 * The scale's top: `GRIDLINES` round steps that hold `v`. The top gridline
 * sits at the top, so the highest point — the projection's endpoint — lands
 * on or below a labeled line instead of in an unlabeled band above the last.
 */
function scaleTop(v: number): number {
  const raw = Math.max(v / GRIDLINES, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = (NICE.find((n) => n * mag >= raw) ?? 10) * mag;
  return step * GRIDLINES;
}
