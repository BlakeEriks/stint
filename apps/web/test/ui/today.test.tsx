import { beforeEach, describe, expect, it } from 'vitest';
import { chooseToday } from '@/lib/client/today';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const real = new Date('2026-11-03T17:00:00.000Z'); // Nov 3, 10:00 in Denver

describe('choosing the day the app treats as today', () => {
  beforeEach(() => sessionStorage.clear());

  /* Each row runs after Oct 27 is chosen in the same session. */
  it.each([
    ['a later page with no ?today= keeps it', '', 'preview', 'UTC', -7 * DAY],
    [
      'a malformed ?today= leaves it',
      '?today=20-10',
      undefined,
      'UTC',
      -7 * DAY,
    ],
    ['an empty ?today= clears it', '?today=', undefined, 'UTC', 0],
    ['production never honors it', '', 'production', 'UTC', 0],
    /* DST ended Nov 1: Nov 1's 10:00 is an hour further back than 48h. */
    [
      'keeps the wall clock across DST',
      '?today=2026-11-01',
      undefined,
      'America/Denver',
      -2 * DAY - HOUR,
    ],
  ])('%s', (_, search, env, tz, offset) => {
    chooseToday('?today=2026-10-27', sessionStorage, undefined, 'UTC', real);
    expect(chooseToday(search, sessionStorage, env, tz, real)).toBe(offset);
  });
});
