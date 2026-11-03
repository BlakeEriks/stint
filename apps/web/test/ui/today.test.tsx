import { beforeEach, describe, expect, it } from 'vitest';
import { chooseToday } from '@/lib/client/today';

const DAY = 86_400_000;
const nov3 = new Date('2026-11-03T17:00:00.000Z'); // 10:00 in Denver
const mar10 = new Date('2026-03-11T05:30:00.000Z'); // 23:30 in Denver

describe('choosing the day the app treats as today', () => {
  beforeEach(() => sessionStorage.clear());

  /* Each row runs after Oct 27 is chosen in the same session. */
  it.each([
    [
      'a later page with no ?today= keeps it',
      '',
      'preview',
      'UTC',
      nov3,
      -7 * DAY,
    ],
    [
      'a malformed ?today= leaves it',
      '?today=20-10',
      undefined,
      'UTC',
      nov3,
      -7 * DAY,
    ],
    ['an empty ?today= clears it', '?today=', undefined, 'UTC', nov3, 0],
    ['production never honors it', '', 'production', 'UTC', nov3, 0],
    ['nor does a Vercel development build', '', 'development', 'UTC', nov3, 0],
    /* Both cross a DST change: 10:00 stays 10:00, and 23:30 stays on Mar 8. */
    [
      'keeps the wall clock as DST ends',
      '?today=2026-11-01',
      undefined,
      'America/Denver',
      nov3,
      -2 * DAY,
    ],
    [
      'keeps the day as DST starts',
      '?today=2026-03-08',
      undefined,
      'America/Denver',
      mar10,
      -2 * DAY,
    ],
  ])('%s', (_, search, env, tz, real, offset) => {
    chooseToday('?today=2026-10-27', sessionStorage, undefined, 'UTC', nov3);
    expect(chooseToday(search, sessionStorage, env, tz, real)).toBe(offset);
  });
});
