import { describe, expect, it } from 'vitest';
import { predictCreatedEntry } from '@/lib/client/predict-entry';
import type { CalendarDay, TimeEntry } from '@/lib/client/api';

/**
 * A new entry is drawn the moment Save is pressed, in every cached list and
 * calendar week it belongs to, and nowhere else. A wrong prediction is a
 * block on the wrong day until the refetch, or a total that jumps.
 */

const TZ = 'UTC';
const created = {
  id: 'n1',
  taskName: 'Drawn',
  projectId: null,
  startedAt: '2026-09-09T17:00:00.000Z',
  endedAt: '2026-09-09T18:00:00.000Z',
  isBillable: true,
};

const old = { id: 'e1' } as TimeEntry;

describe('predicting a created entry', () => {
  it('adds it to a list whose range holds it', () => {
    const key = ['entries', { from: '2026-09-09T00:00:00.000Z' }];
    const next = predictCreatedEntry({ entries: [old] }, created, key, TZ) as {
      entries: TimeEntry[];
    };
    expect(next.entries.map((e) => e.id)).toEqual(['e1', 'n1']);
    expect(next.entries[1]).toMatchObject({ durationSeconds: 3600 });
  });

  it('leaves a list that starts after it alone', () => {
    const key = ['entries', { from: '2026-09-10T00:00:00.000Z' }];
    const list = { entries: [old] };
    expect(predictCreatedEntry(list, created, key, TZ)).toBe(list);
  });

  it('adds it to its day in the week that holds it, and counts it', () => {
    const key = ['calendar', '2026-09-07T00:00:00.000Z', TZ];
    const days: CalendarDay[] = [
      { date: '2026-09-09', totalSeconds: 600, entries: [old] },
    ];
    const next = predictCreatedEntry({ days }, created, key, TZ) as {
      days: CalendarDay[];
    };
    expect(next.days[0]?.entries.map((e) => e.id)).toEqual(['e1', 'n1']);
    expect(next.days[0]?.totalSeconds).toBe(4200);
  });

  it('opens its day when the week had nothing on it', () => {
    const key = ['calendar', '2026-09-07T00:00:00.000Z', TZ];
    const next = predictCreatedEntry({ days: [] }, created, key, TZ) as {
      days: CalendarDay[];
    };
    expect(next.days).toEqual([
      {
        date: '2026-09-09',
        totalSeconds: 3600,
        entries: [expect.objectContaining({ id: 'n1' })],
      },
    ]);
  });

  it('leaves another week alone', () => {
    const key = ['calendar', '2026-09-14T00:00:00.000Z', TZ];
    const week = { days: [] };
    expect(predictCreatedEntry(week, created, key, TZ)).toBe(week);
  });

  it('leaves a single entry and an unfetched query alone', () => {
    expect(predictCreatedEntry(old, created, ['entries', 'e1'], TZ)).toBe(old);
    expect(
      predictCreatedEntry(undefined, created, ['calendar', 'x', TZ], TZ),
    ).toBeUndefined();
  });
});
