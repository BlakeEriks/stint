import { beforeEach, describe, expect, it } from 'vitest';
import { chooseToday } from '@/lib/client/today';

const DAY = 86_400_000;
const real = new Date(2026, 10, 2, 9, 30); // Nov 2, local

describe('choosing the day the app treats as today', () => {
  beforeEach(() => sessionStorage.clear());

  it('shifts by whole days to ?today=, and the choice sticks', () => {
    expect(
      chooseToday('?today=2026-10-20', sessionStorage, undefined, real),
    ).toBe(-13 * DAY);
    expect(chooseToday('', sessionStorage, 'preview', real)).toBe(-13 * DAY);
  });

  it('clears with an empty ?today= and ignores a malformed one', () => {
    chooseToday('?today=2026-10-20', sessionStorage, undefined, real);
    expect(chooseToday('?today=20-10', sessionStorage, undefined, real)).toBe(
      -13 * DAY,
    );
    expect(chooseToday('?today=', sessionStorage, undefined, real)).toBe(0);
    expect(chooseToday('', sessionStorage, undefined, real)).toBe(0);
  });

  it('is never honored in production', () => {
    expect(
      chooseToday('?today=2026-10-20', sessionStorage, 'production', real),
    ).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
