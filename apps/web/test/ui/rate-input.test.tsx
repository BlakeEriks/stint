import { describe, it, expect } from 'vitest';
import { isValidRate, parseRate } from '@/components/rate-input';

/* What the server's `money` accepts: zero or more, in whole cents. A rate
   it refuses would roll back an optimistic save. */
describe('isValidRate', () => {
  it.each([
    ['150', true],
    ['0', true],
    ['1.15', true],
    ['99.99', true],
    ['', false],
    ['abc', false],
    ['-5', false],
    ['1.234', false],
  ])('%j is %s', (text, valid) => {
    expect(isValidRate(parseRate(text))).toBe(valid);
  });
});
