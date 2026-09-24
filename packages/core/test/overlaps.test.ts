import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOverlaps } from '../src/overlaps.ts';

const m = (min: number) => min * 60_000;

test('a shared minute or more is an overlap; less is not', () => {
  assert.deepEqual(
    findOverlaps([
      { id: 'a', start: m(0), end: m(10) },
      { id: 'b', start: m(9), end: m(20) },
    ]),
    [{ earlier: 'a', later: 'b', seconds: 60 }],
  );
  assert.deepEqual(
    findOverlaps([
      { id: 'a', start: m(0), end: m(10) },
      { id: 'b', start: m(10) - 8000, end: m(20) },
    ]),
    [],
  );
});

test('touching endpoints are not an overlap', () => {
  assert.deepEqual(
    findOverlaps([
      { id: 'a', start: m(0), end: m(10) },
      { id: 'b', start: m(10), end: m(20) },
    ]),
    [],
  );
});

test('a range inside another counts its own length, and every pair is found', () => {
  assert.deepEqual(
    findOverlaps([
      { id: 'c', start: m(30), end: m(40) },
      { id: 'a', start: m(0), end: m(60) },
      { id: 'b', start: m(5), end: m(15) },
    ]),
    [
      { earlier: 'a', later: 'b', seconds: 600 },
      { earlier: 'a', later: 'c', seconds: 600 },
    ],
  );
});
