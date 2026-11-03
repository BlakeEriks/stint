import { beforeEach, describe, expect, it } from 'vitest';
import { chooseToday } from '@/lib/client/today';

const DAY = 86_400_000;
const real = new Date(2026, 10, 2, 9, 30); // Nov 2, local

describe('choosing the day the app treats as today', () => {
  beforeEach(() => sessionStorage.clear());

  /* Each row runs after the first has chosen Oct 20 in the same session. */
  it.each([
    ['a later page with no ?today= keeps it', '', 'preview', -13 * DAY],
    ['a malformed ?today= leaves it', '?today=20-10', undefined, -13 * DAY],
    ['an empty ?today= clears it', '?today=', undefined, 0],
    ['production never honors it', '', 'production', 0],
  ])('%s', (_, search, env, offset) => {
    expect(
      chooseToday('?today=2026-10-20', sessionStorage, undefined, real),
    ).toBe(-13 * DAY);
    expect(chooseToday(search, sessionStorage, env, real)).toBe(offset);
  });
});
