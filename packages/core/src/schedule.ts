/**
 * Supporting detail: the invoice's billed time bucketed by project, week and
 * date, in hours only.
 *
 * It sits after the invoice, from page 2, and never sums into it: the lines
 * are the amount owed, and these tables are how a project lead checks them.
 * Pure, so the preview and the invoice build the same tables; the invoice
 * freezes them at generation.
 */

import { resolveRate } from './rates.ts';
import { addDays, localDateKey } from './calendar.ts';
import { hundredths, type BillableEntry } from './invoice.ts';

export type ScheduleKind = 'project' | 'week' | 'date';

/** Print order, whatever order they were chosen in. */
export const SCHEDULE_KINDS: ScheduleKind[] = ['project', 'week', 'date'];

/** Each table's title, on the form, the detail screen and the PDF alike. */
export const SCHEDULE_TITLES: Record<ScheduleKind, string> = {
  project: 'Hours by project',
  week: 'Hours by week',
  date: 'Hours by date',
};

/** The tables an invoice carries, in print order. */
export const attachedSchedules = (detail: Schedules | null): ScheduleKind[] =>
  SCHEDULE_KINDS.filter((k) => detail?.[k] !== undefined);

export interface ProjectRow {
  project: string;
  hours: number;
}
export interface WeekRow {
  /** ISO dates, clipped to the period. */
  start: string;
  end: string;
  hours: number;
}
export interface DateRow {
  date: string;
  project: string;
  hours: number;
}

/** The tables an invoice carries; absent is not chosen. */
export interface Schedules {
  project?: ProjectRow[];
  week?: WeekRow[];
  date?: DateRow[];
  totalHours: number;
}

const UNASSIGNED = 'Unassigned';

/**
 * Every table, from the entries the invoice bills.
 *
 * An entry counts only if it would be on a line: billable and rated. Each
 * entry's hours are rounded as `buildLineItems` rounds them and summed, so a
 * row is exactly what its entries print and, at one rate, the total equals
 * the summary line's quantity.
 */
export function buildSchedules(
  entries: BillableEntry[],
  opts: { tz: string; periodStart: string; periodEnd: string },
): Required<Schedules> {
  const billed = entries.filter(
    (e) =>
      e.isBillable &&
      resolveRate({
        entryRateOverride: e.rateOverride,
        projectRate: e.projectRate,
        clientRate: e.clientRate,
        userDefaultRate: e.userDefaultRate,
      }) != null,
  );

  const byProject = new Map<string, number>();
  const byWeek = new Map<string, number>();
  const byDate = new Map<string, number>();
  let total = 0;

  for (const e of billed) {
    const h = hundredths(e.durationSeconds);
    const project = e.projectName ?? UNASSIGNED;
    // The day it started, as By day counts an entry that crosses midnight.
    const date = localDateKey(new Date(e.startedAt), opts.tz);
    add(byProject, project, h);
    add(byWeek, mondayOf(date), h);
    add(byDate, `${date}\0${project}`, h);
    total += h;
  }

  return {
    project: [...byProject]
      .map(([project, h]) => ({ project, hours: h / 100 }))
      .sort((a, b) => b.hours - a.hours || a.project.localeCompare(b.project)),
    week: [...byWeek]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monday, h]) => ({
        start: monday < opts.periodStart ? opts.periodStart : monday,
        end: min(addDays(monday, 6), opts.periodEnd),
        hours: h / 100,
      })),
    date: [...byDate]
      .map(([key, h]) => {
        const [date = '', project = ''] = key.split('\0');
        return { date, project, hours: h / 100 };
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.project.localeCompare(b.project),
      ),
    totalHours: total / 100,
  };
}

/** Only the tables chosen, in print order. */
export function pickSchedules(
  all: Required<Schedules>,
  chosen: ScheduleKind[],
): Schedules | null {
  if (chosen.length === 0) return null;
  const picked: Schedules = { totalHours: all.totalHours };
  for (const kind of SCHEDULE_KINDS)
    if (chosen.includes(kind)) Object.assign(picked, { [kind]: all[kind] });
  return picked;
}

export type ScheduleRow = ProjectRow | WeekRow | DateRow;

/** One table, or the part of it that fits on one page. */
export interface DetailBlock {
  kind: ScheduleKind;
  /** Carried over from the page before: its heading says "(continued)". */
  continued: boolean;
  rows: ScheduleRow[];
  /** On the table's last block only. */
  total: number | null;
}

/** A heading and its column headings, each one row tall. */
const HEAD = 2;

/**
 * Splits the chosen tables into detail pages of `rowsPerPage` one-line rows.
 *
 * Decided here rather than by the PDF renderer, which cannot tell a table it
 * was broken: the break is what "(continued)" needs to know. A table never
 * starts without room for a row under its headings, and its Total row never
 * starts a page alone.
 */
export function paginateSchedules(
  schedules: Schedules,
  rowsPerPage: number,
): DetailBlock[][] {
  const pages: DetailBlock[][] = [];
  let page: DetailBlock[] = [];
  let room = rowsPerPage;

  const turn = () => {
    pages.push(page);
    page = [];
    room = rowsPerPage;
  };

  for (const kind of SCHEDULE_KINDS) {
    const rows: ScheduleRow[] = schedules[kind] ?? [];
    let at = 0;

    while (at < rows.length) {
      if (room < HEAD + 1) turn();
      const left = rows.length - at;
      const fit = room - HEAD;
      // Everything and the total; or all but one row, which goes on with the
      // total; or as many as fit.
      const take = left < fit ? left : left === fit ? left - 1 : fit;
      if (take === 0) {
        turn();
        continue;
      }
      const last = take === left;
      page.push({
        kind,
        continued: at > 0,
        rows: rows.slice(at, at + take),
        total: last ? schedules.totalHours : null,
      });
      room -= HEAD + take + (last ? 1 : 0);
      at += take;
      if (!last) turn();
    }
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

function add(map: Map<string, number>, key: string, h: number) {
  map.set(key, (map.get(key) ?? 0) + h);
}

/** The Monday on or before an ISO date. */
function mondayOf(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

const min = (a: string, b: string) => (a < b ? a : b);
