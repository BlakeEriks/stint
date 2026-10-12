/**
 * The user's records as CSV: every finished entry, and every invoice.
 *
 * Built for a spreadsheet and an accountant (`specs/006-csv-export`): US
 * dates and 12-hour times in the user's zone, money as plain two-place
 * decimals beside a currency column, so a column sums without cleanup.
 */

import { localDateKey } from './calendar.ts';
import { formatLocalTime } from './format.ts';
import { billedAmount, hundredths } from './invoice.ts';
import { resolveRate, resolveRateSource } from './rates.ts';

/** A number is written to two places; a string as text; null as empty. */
type Cell = string | number | null;

/* A text cell starting with one of these runs as a formula when the file
   opens in a spreadsheet; OWASP's fix is a leading quote. Task names arrive
   from imports as well as typing. */
const FORMULA = /^[=+\-@\t\r]/;

function cell(value: Cell): string {
  if (value == null) return '';
  if (typeof value === 'number') return value.toFixed(2);
  const text = FORMULA.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * RFC 4180 with CRLF, behind a UTF-8 byte-order mark: without it, Excel
 * reads the file as Windows-1252 and mangles any name outside ASCII.
 */
export function toCsv(header: string[], rows: Cell[][]): string {
  return `﻿${[header, ...rows].map((r) => `${r.map(cell).join(',')}\r\n`).join('')}`;
}

/** `2026-09-01` → `09/01/2026`. */
const usDate = (date: string | null): string | null => {
  if (!date) return null;
  const [y, m, d] = date.split('-');
  return `${m}/${d}/${y}`;
};

/** An instant's local day in `tz`, US style. */
const usDay = (at: string | null, tz: string) =>
  at ? usDate(localDateKey(new Date(at), tz)) : null;

/* Intl puts a narrow no-break space before AM/PM, which a spreadsheet reads
   as text rather than a time. */
const usTime = (at: string, tz: string) =>
  formatLocalTime(at, tz).replace(/ /g, ' ');

export interface ExportEntry {
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  projectId: string | null;
  taskName: string;
  isBillable: boolean;
  rateOverride?: number | null;
  invoiceId?: string | null;
  invoicedElsewhere?: boolean;
}

export interface ExportProject {
  id: string;
  clientId: string | null;
  name: string;
  hourlyRate: number | null;
}

export interface ExportClient {
  id: string;
  name: string;
  hourlyRate: number | null;
  currency: string | null;
}

export interface ExportInvoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  sequenceNo: number;
  status: 'draft' | 'sent' | 'paid' | 'void';
  issueDate: string;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  expensesSubtotal: number | null;
  total: number | null;
  currency: string;
  sentAt: string | null;
  paidAt: string | null;
}

const ENTRY_HEADER = [
  'Date',
  'Start',
  'End',
  'Hours',
  'Client',
  'Project',
  'Task',
  'Billable',
  'Rate',
  'Rate source',
  'Amount',
  'Currency',
  'Invoice',
];

/**
 * One row per finished entry, oldest first. The rate is the one the entry
 * resolves to now, by the chain that bills; the hours and amount are the
 * printed hundredths and their price, so a row reads as an invoice line of
 * that entry alone would. A running entry has no end yet and is left out.
 */
export function entriesCsv(
  data: {
    entries: ExportEntry[];
    projects: ExportProject[];
    clients: ExportClient[];
    invoices: Pick<ExportInvoice, 'id' | 'invoiceNumber'>[];
    defaultRate: number | null;
    currency: string;
  },
  tz: string,
): string {
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const numbers = new Map(data.invoices.map((i) => [i.id, i.invoiceNumber]));

  const rows = data.entries
    .filter((e): e is ExportEntry & { endedAt: string } => e.endedAt != null)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map((e) => {
      const project = e.projectId ? projects.get(e.projectId) : undefined;
      const client = project?.clientId
        ? clients.get(project.clientId)
        : undefined;
      const ctx = {
        entryRateOverride: e.rateOverride,
        projectRate: project?.hourlyRate,
        clientRate: client?.hourlyRate,
        userDefaultRate: data.defaultRate,
      };
      const rate = resolveRate(ctx);
      const seconds =
        e.durationSeconds ??
        (Date.parse(e.endedAt) - Date.parse(e.startedAt)) / 1000;
      return [
        usDay(e.startedAt, tz),
        usTime(e.startedAt, tz),
        usTime(e.endedAt, tz),
        hundredths(seconds) / 100,
        client?.name ?? null,
        project?.name ?? null,
        e.taskName,
        e.isBillable ? 'Yes' : 'No',
        rate,
        resolveRateSource(ctx),
        e.isBillable && rate != null ? billedAmount(seconds, rate) : null,
        client?.currency ?? data.currency,
        e.invoicedElsewhere
          ? 'Invoiced elsewhere'
          : (numbers.get(e.invoiceId ?? '') ?? null),
      ];
    });
  return toCsv(ENTRY_HEADER, rows);
}

const INVOICE_HEADER = [
  'Invoice',
  'Client',
  'Status',
  'Issue date',
  'Due date',
  'Sent date',
  'Paid date',
  'Period start',
  'Period end',
  'Subtotal',
  'Tax rate',
  'Tax',
  'Expenses',
  'Total',
  'Currency',
];

const STATUS = { draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void' };

/**
 * One row per invoice, every status, newest issue date first: a void row
 * explains a gap in the numbering. The totals are the invoice's frozen ones.
 */
export function invoicesCsv(
  data: {
    invoices: ExportInvoice[];
    clients: Pick<ExportClient, 'id' | 'name'>[];
  },
  tz: string,
): string {
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const rows = [...data.invoices]
    .sort(
      (a, b) =>
        b.issueDate.localeCompare(a.issueDate) || b.sequenceNo - a.sequenceNo,
    )
    .map((i) => [
      i.invoiceNumber,
      clients.get(i.clientId) ?? null,
      STATUS[i.status],
      usDate(i.issueDate),
      usDate(i.dueDate),
      usDay(i.sentAt, tz),
      usDay(i.paidAt, tz),
      usDate(i.periodStart),
      usDate(i.periodEnd),
      i.subtotal,
      i.taxRate,
      i.taxAmount,
      i.expensesSubtotal,
      i.total,
      i.currency,
    ]);
  return toCsv(INVOICE_HEADER, rows);
}
