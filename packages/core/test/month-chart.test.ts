import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEarnedPace, MIN_PACE_DAYS } from '../src/stats.ts';
import { monthChart } from '../src/month-chart.ts';

/* Every day of a 28-, 30- and 31-day month, each with an awkward amount
   every day so the peak never lands on a round step. Feb 2026 opens on a
   Sunday, Aug 2026 on a Saturday and ends on a Monday, Jan 2026 ends on a
   Saturday. */
/* The smallest top the scale has: a peak below it is drawn against it. */
const MIN_TOP = 4;

const MONTHS = [
  ['2026-02', 28],
  ['2026-09', 30],
  ['2026-08', 31],
  ['2026-01', 31],
] as const;

function daysOf(prefix: string, length: number): string[] {
  return Array.from(
    { length },
    (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`,
  );
}

for (const [prefix, length] of MONTHS) {
  const days = daysOf(prefix, length);
  const byDay = new Map(days.map((d, i) => [d, 137.37 * ((i % 5) + 1)]));

  test(`${prefix}: every day draws inside its scale`, () => {
    for (const day of days) {
      const pace = buildEarnedPace({
        byDay,
        now: new Date(`${day}T12:00:00Z`),
        tz: 'UTC',
      });
      const chart = monthChart(pace);

      assert.equal(
        chart.projection.state === 'pending',
        pace.businessDaysElapsed < MIN_PACE_DAYS,
        `${day}: pending exactly while under ${MIN_PACE_DAYS} business days`,
      );

      const plot = chart.plot;
      if (!plot) continue;
      assert.equal(plot.gridlines.at(-1), plot.top, `${day}: top is labeled`);
      const points = [...plot.solid, ...(plot.dashed ?? [])];
      for (const p of points) {
        assert.ok(p.y >= 0 && p.y <= 1, `${day}: ${p.y} under the top`);
        assert.ok(p.x >= 0 && p.x <= 1, `${day}: ${p.x} inside the month`);
      }
      const peak = Math.max(...points.map((p) => p.y)) * plot.top;
      if (peak >= MIN_TOP) {
        assert.ok(peak / plot.top >= 0.8, `${day}: under a fifth empty`);
      }
      assert.deepEqual({ x: plot.today.x, y: plot.today.y }, plot.solid.at(-1));
      assert.equal(
        plot.today.anchor,
        plot.today.x === 1 ? 'end' : 'middle',
        `${day}: today anchors flush only at the axis's end`,
      );
    }
  });

  test(`${prefix}: the last day anchors today flush at the end`, () => {
    const day = days.at(-1) as string;
    const plot = monthChart(
      buildEarnedPace({ byDay, now: new Date(`${day}T12:00:00Z`), tz: 'UTC' }),
    ).plot;
    assert.ok(plot);
    assert.equal(plot.today.x, 1);
    assert.equal(plot.today.anchor, 'end');
  });
}

test('the scale rounds up to a step a reader can add', () => {
  for (const [amount, gridlines] of [
    [11_817, [3000, 6000, 9000, 12_000]],
    [4441, [1200, 2400, 3600, 4800]],
    [13_500, [3500, 7000, 10_500, 14_000]],
    [1300, [350, 700, 1050, 1400]],
    [0, [1, 2, 3, 4]],
  ] as const) {
    const plot = monthChart({
      projected: amount,
      series: [
        { date: '2026-09-01', actual: 0 },
        { date: '2026-09-02', actual: 0 },
        { date: '2026-09-03', actual: null },
      ],
      projection: {
        from: { date: '2026-09-02', amount: 0 },
        to: { date: '2026-09-30', amount },
      },
    }).plot;
    assert.deepEqual(
      plot?.gridlines.map((v) => Math.round(v * 100) / 100),
      gridlines,
    );
  }
});

test('a month with one day on it has a figure but no plot', () => {
  const chart = monthChart({
    projected: null,
    series: [
      { date: '2026-09-01', actual: 400 },
      { date: '2026-09-02', actual: null },
    ],
    projection: null,
  });
  assert.equal(chart.plot, null);
  assert.deepEqual(chart.projection, { state: 'pending' });
});

test('a projection is a figure with its dashed segment', () => {
  const chart = monthChart({
    projected: 900,
    series: [
      { date: '2026-09-01', actual: 100 },
      { date: '2026-09-02', actual: 300 },
      { date: '2026-09-03', actual: null },
      { date: '2026-09-04', actual: null },
    ],
    projection: {
      from: { date: '2026-09-02', amount: 300 },
      to: { date: '2026-09-04', amount: 900 },
    },
  });
  assert.deepEqual(chart.projection, { state: 'figure', amount: 900 });
  assert.deepEqual(chart.plot?.dashed, [
    { x: 1 / 3, y: 300 / 1000 },
    { x: 1, y: 900 / 1000 },
  ]);
  assert.deepEqual(chart.plot?.today, {
    x: 1 / 3,
    y: 300 / 1000,
    anchor: 'middle',
  });
});
