import type { Stats } from './api';

type Attention = Stats['attention'];

/** What an overlap row's entry overlaps, as the Inbox and a calendar block
    both name it: a billed other by its invoice, since it can't be edited. */
export function overlapped(o: Attention['overlaps'][number]) {
  return `${o.otherTaskName || 'another entry'}${
    o.otherInvoiceNumber ? ` on ${o.otherInvoiceNumber}` : ''
  }`;
}

/** A strange-duration row's qualifier: which threshold it tripped. */
export function lengthReason(kind: 'short' | 'long') {
  return kind === 'short' ? 'unusually short' : 'unusually long';
}

/**
 * The entries the Inbox doubts, by id, with why — the calendar's marks.
 *
 * Only the Inbox's warning rows: overlaps and lengths ask whether the record
 * is right, where an entry with no project is a chore. An overlap marks the
 * entry its row is about, the one Edit entry opens; the other may be billed
 * and locked.
 */
export function suspectEntries(attention: Attention) {
  const reasons = new Map<string, string[]>();
  const add = (id: string, reason: string) =>
    reasons.set(id, [...(reasons.get(id) ?? []), reason]);
  for (const e of attention.strangeDurations)
    add(e.entryId, lengthReason(e.kind));
  for (const o of attention.overlaps)
    add(o.entryId, `overlaps ${overlapped(o)}`);
  return reasons;
}
