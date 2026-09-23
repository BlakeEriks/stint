import type { ParsedRow } from './preview.ts';

/*
 * Toggl Track's detailed-report CSV. Columns consumed: Client, Project, Task,
 * Description, Billable, Start date, Start time, End date, End time,
 * Duration, and the "Amount (…)" column when present. Tags are dropped —
 * there is no tag concept here. The export has no entry id and no zone:
 * times are wall clock in the exporting account's zone.
 */
const REQUIRED = [
  'project',
  'description',
  'start date',
  'start time',
  'end date',
  'end time',
  'duration',
];

export function isTogglHeader(header: string[]): boolean {
  const cols = header.map((h) => h.trim().toLowerCase());
  return REQUIRED.every((r) => cols.includes(r));
}

export class ImportFormatError extends Error {}

function date(s: string, line: number): string {
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us)
    return `${us[3]}-${us[1]?.padStart(2, '0')}-${us[2]?.padStart(2, '0')}`;
  throw new ImportFormatError(`Line ${line}: unreadable date "${s}"`);
}

function time(s: string, line: number): string {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) throw new ImportFormatError(`Line ${line}: unreadable time "${s}"`);
  let h = Number(m[1]);
  const meridiem = m[4]?.toLowerCase();
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
}

function duration(s: string, line: number): number | null {
  if (!s.trim()) return null;
  const m = s.trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m)
    throw new ImportFormatError(`Line ${line}: unreadable duration "${s}"`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function amount(s: string | undefined): number | null {
  const v = (s ?? '').replace(/[$,\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseToggl(csv: string[][]): ParsedRow[] {
  const [header = [], ...body] = csv;
  const cols = header.map((h) => h.trim().toLowerCase());
  const at = (r: string[], name: string) =>
    (r[cols.indexOf(name)] ?? '').trim();
  const amountCol = cols.findIndex((c) => c.startsWith('amount'));
  const seen = new Map<string, number>();

  return body.map((r, i) => {
    const line = i + 2;
    const endDate = at(r, 'end date');
    const endTime = at(r, 'end time');
    const hasEnd = endDate !== '' && endTime !== '';
    const row = {
      clientName: at(r, 'client') || null,
      projectName: at(r, 'project') || null,
      taskName: at(r, 'description') || at(r, 'task'),
      startDate: date(at(r, 'start date'), line),
      startTime: time(at(r, 'start time'), line),
      endDate: hasEnd ? date(endDate, line) : null,
      endTime: hasEnd ? time(endTime, line) : null,
    };
    // Identical rows are told apart by position among their twins, which a
    // re-upload of the same file reproduces.
    const key = Object.values(row).join('\u001f');
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const billable = at(r, 'billable').toLowerCase();

    return {
      ...row,
      sourceRowId: `${key}\u001f${n}`,
      reportedDurationSeconds: duration(at(r, 'duration'), line),
      reportedAmount: amountCol >= 0 ? amount(r[amountCol]) : null,
      billable: billable === 'yes' ? true : billable === 'no' ? false : null,
    };
  });
}
