import { describe, it, expect } from 'vitest';
import type { Stats } from '@/lib/client/api';
import { suspectEntries } from '@/lib/client/suspects';

type Attention = Stats['attention'];

const A = '018f0000-0000-7000-8000-00000000000a';
const B = '018f0000-0000-7000-8000-00000000000b';
const at = '2026-09-17T14:00:00.000Z';

const empty: Attention = {
  overdueInvoices: [],
  staleDrafts: [],
  unprojected: [],
  strangeDurations: [],
  overlaps: [],
};

const overlap = (o: Partial<Attention['overlaps'][number]> = {}) => ({
  entryId: A,
  taskName: 'Pairing',
  otherEntryId: B,
  otherTaskName: 'Code review',
  otherInvoiceNumber: null,
  startedAt: at,
  seconds: 600,
  ...o,
});

const strange = (kind: 'short' | 'long') => ({
  entryId: A,
  kind,
  taskName: 'Pairing',
  projectName: null,
  clientName: null,
  startedAt: at,
  seconds: 60,
});

describe('suspectEntries', () => {
  it('marks only the entry an overlap row is about, naming the other', () => {
    const marks = suspectEntries({ ...empty, overlaps: [overlap()] });
    expect(marks.get(A)).toEqual(['overlaps Code review']);
    expect(marks.has(B)).toBe(false);
  });

  it('names an untitled other, and the invoice holding a billed one', () => {
    expect(
      suspectEntries({
        ...empty,
        overlaps: [overlap({ otherTaskName: '' })],
      }).get(A),
    ).toEqual(['overlaps another entry']);
    expect(
      suspectEntries({
        ...empty,
        overlaps: [overlap({ otherInvoiceNumber: 'INV-0007' })],
      }).get(A),
    ).toEqual(['overlaps Code review on INV-0007']);
  });

  it('says which way a length is unusual', () => {
    expect(
      suspectEntries({ ...empty, strangeDurations: [strange('short')] }).get(A),
    ).toEqual(['unusually short']);
    expect(
      suspectEntries({ ...empty, strangeDurations: [strange('long')] }).get(A),
    ).toEqual(['unusually long']);
  });

  it('gives one entry every reason it has, length first', () => {
    const marks = suspectEntries({
      ...empty,
      strangeDurations: [strange('long')],
      overlaps: [
        overlap(),
        overlap({ otherEntryId: B, otherTaskName: 'Standup' }),
      ],
    });
    expect(marks.get(A)).toEqual([
      'unusually long',
      'overlaps Code review',
      'overlaps Standup',
    ]);
  });

  it('leaves an entry with no project, and an empty Inbox, unmarked', () => {
    expect(
      suspectEntries({
        ...empty,
        unprojected: [
          { entryId: A, taskName: 'x', startedAt: at, seconds: 60 },
        ],
      }).size,
    ).toBe(0);
    expect(suspectEntries(empty).size).toBe(0);
  });
});
