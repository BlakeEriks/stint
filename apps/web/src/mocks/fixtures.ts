import {
  addDays,
  type BillableEntry,
  buildLineItems,
  formatInvoiceNumber,
  localDateKey,
  localDateTimeToInstant,
  localDayOfWeek,
} from '@stint/core';
import type {
  Client,
  Expense,
  Invoice,
  PaymentProfile,
  Project,
  Settings,
  StoredLineItem,
  TimeEntry,
} from '@/lib/client/api';
import { ZONE } from './time.mts';

/**
 * One account, as the fake `/api/v1` serves it: rebuilt from nothing for every
 * story, relative to the story's clock, so every screen reads the same six
 * weeks of work and a story's clicks never reach the next one.
 *
 * Modeled on `scripts/seed-account.mjs`: one of every inbox row, a client
 * that inherits the default rate, one with no color, one archived, and
 * internal work.
 */

type StoredInvoice = Invoice & { lineItems: StoredLineItem[] };

export interface Db {
  now: Date;
  email: string;
  settings: Settings;
  clients: Client[];
  projects: Project[];
  entries: TimeEntry[];
  invoices: StoredInvoice[];
  expenses: Expense[];
  paymentProfiles: PaymentProfile[];
}

/** A fixed id per record, valid for `@stint/schema`'s strict `uuid`. */
export const id = (n: number) =>
  `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const ids = {
  northwind: id(101),
  meridian: id(102),
  byrne: id(103),
  oldEngagement: id(104),
  warehouse: id(201),
  rush: id(202),
  pipeline: id(203),
  brand: id(204),
  legacy: id(205),
  admin: id(206),
  ach: id(401),
  wire: id(402),
  claudeMax: id(601),
  figma: id(613),
  stockPhotos: id(614),
} as const;

const TASKS: Record<string, string[]> = {
  [ids.warehouse]: [
    'Filter panel and saved views',
    'Inventory sync edge cases',
    'Query performance pass',
  ],
  [ids.rush]: ['Checkout timeout fix', 'Carrier label retries'],
  [ids.pipeline]: ['Pairing on the ingest job', 'Reviewed the API contract'],
  [ids.brand]: ['Homepage hero layout', 'Type scale for the brand site'],
  [ids.admin]: ['Invoicing and bookkeeping'],
};

const BILLABLE = [ids.warehouse, ids.pipeline, ids.rush, ids.brand];

export const settings = (): Settings => ({
  defaultHourlyRate: 125,
  currency: 'USD',
  weekStartsOn: 1,
  timeFormat: '12h',
  minEntrySeconds: 60,
  maxEntryHours: 12,
  businessName: 'Blake Eriks',
  businessAddress: '1200 Pine St, Suite 4\nSeattle, WA 98101',
  businessEmail: 'billing@blakeeriks.test',
  logoUrl: null,
  taxId: null,
  defaultPaymentTerms: 'Net 30',
  invoiceNumberPrefix: 'STINT-',
  nextInvoiceNumber: 16,
  paymentNotice:
    'Our bank details never change by email. Call before paying new ones.',
});

const client = (c: Partial<Client> & Pick<Client, 'id' | 'name'>): Client => ({
  email: null,
  address: null,
  hourlyRate: null,
  taxRate: null,
  currency: 'USD',
  color: null,
  paymentProfileId: null,
  archivedAt: null,
  ...c,
});

const project = (
  p: Partial<Project> & Pick<Project, 'id' | 'name' | 'clientId'>,
): Project => ({
  hourlyRate: null,
  isBillableDefault: p.clientId !== null,
  archivedAt: null,
  ...p,
});

/** A stopped entry, `minutes` long, starting at `time` on `date` locally. */
export function entry(
  n: number,
  date: string,
  time: string,
  minutes: number,
  projectId: string | null,
  taskName: string,
  over: Partial<TimeEntry> = {},
): TimeEntry {
  const start = localDateTimeToInstant(date, time, ZONE);
  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    id: id(n),
    projectId,
    taskName,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    isBillable: projectId !== ids.admin,
    rateOverride: null,
    invoiceId: null,
    durationSeconds: Math.round(minutes * 60),
    durationOk: false,
    ...over,
  };
}

export function seed(now: Date): Db {
  const today = localDateKey(now, ZONE);
  const day = (back: number) => addDays(today, -back);

  const clients = [
    client({
      id: ids.northwind,
      name: 'Northwind Trading',
      email: 'ap@northwind.test',
      address: '400 Market St\nSan Francisco, CA 94105',
      hourlyRate: 150,
      taxRate: 0,
      color: '#6EA1E2',
      paymentProfileId: ids.ach,
    }),
    // Inherits the user default — worth seeing resolved.
    client({ id: ids.meridian, name: 'Meridian Labs', color: '#A390DC' }),
    // No color: the hollow ring.
    client({ id: ids.byrne, name: 'Byrne Studio', hourlyRate: 110 }),
    client({
      id: ids.oldEngagement,
      name: 'Old Engagement Co',
      hourlyRate: 140,
      color: '#D38B59',
      archivedAt: '2026-06-30T16:00:00.000Z',
    }),
  ];

  const projects = [
    project({
      id: ids.warehouse,
      clientId: ids.northwind,
      name: 'Warehouse dashboard',
    }),
    project({
      id: ids.rush,
      clientId: ids.northwind,
      name: 'Rush: peak season fixes',
      hourlyRate: 195,
    }),
    project({
      id: ids.pipeline,
      clientId: ids.meridian,
      name: 'Data pipeline audit',
    }),
    project({ id: ids.brand, clientId: ids.byrne, name: 'Brand site rebuild' }),
    project({
      id: ids.legacy,
      clientId: ids.oldEngagement,
      name: 'Legacy retainer',
      archivedAt: '2026-06-30T16:00:00.000Z',
    }),
    project({ id: ids.admin, clientId: null, name: 'Admin and invoicing' }),
  ];

  /* Six weeks of weekdays, two blocks a day plus some admin. The durations
     step with the day so neighboring days differ. */
  const entries: TimeEntry[] = [];
  let n = 1000;
  for (let back = 42; back >= 1; back -= 1) {
    const date = day(back);
    const dow = localDayOfWeek(
      localDateTimeToInstant(date, '12:00', ZONE),
      ZONE,
    );
    if (dow === 0 || dow === 6) continue;
    const first = BILLABLE[back % 4] as string;
    const second = BILLABLE[(back + 1) % 4] as string;
    entries.push(
      entry(
        n++,
        date,
        '09:00',
        150 + ((back * 37) % 90),
        first,
        task(first, back),
      ),
      entry(
        n++,
        date,
        '13:00',
        90 + ((back * 53) % 120),
        second,
        task(second, back + 1),
      ),
    );
    if (back % 3 === 0)
      entries.push(
        entry(n++, date, '16:45', 45, ids.admin, task(ids.admin, 0)),
      );
  }

  // Today so far.
  entries.push(
    entry(n++, today, '09:00', 135, ids.warehouse, task(ids.warehouse, 0)),
    entry(n++, today, '11:30', 75, ids.pipeline, task(ids.pipeline, 0)),
  );

  /* The inbox's rows: work with no project, a duration too short and one too
     long to be real, and two blocks that overlap. */
  entries.push(
    entry(n++, day(3), '17:00', 60, null, 'Research: carrier APIs'),
    entry(n++, day(9), '17:30', 30, null, 'Quick call with Priya'),
    entry(n++, day(2), '17:10', 0.5, ids.warehouse, 'Sprint planning'),
    entry(n++, day(4), '08:00', 13.5 * 60, ids.brand, 'Launch day support'),
    entry(n++, day(1), '14:30', 60, ids.rush, 'Client call and follow-ups'),
  );

  const invoices = invoicesFor(entries, projects, clients);
  const expenses = expensesFor(invoices);

  return {
    now,
    email: 'dev@localhost.test',
    settings: settings(),
    clients,
    projects,
    entries,
    invoices,
    expenses,
    paymentProfiles: [
      {
        id: ids.ach,
        name: 'Business checking',
        isDefault: true,
        accountHolderName: 'Blake Eriks',
        accountHolderAddress: null,
        bankName: 'First Federal Bank',
        bankAddress: null,
        accountNumber: '000123456789',
        routingNumber: '011000015',
        accountType: 'checking',
        iban: null,
        swiftBic: null,
        localCodeLabel: null,
        localCode: null,
        intermediaryBankName: null,
        intermediarySwiftBic: null,
        intermediaryAccountNumber: null,
        paymentLinkLabel: null,
        paymentLinkUrl: null,
        currency: 'USD',
        feeAllocation: null,
        notes: null,
        archivedAt: null,
      },
      {
        id: ids.wire,
        name: 'International wire',
        isDefault: false,
        accountHolderName: 'Blake Eriks',
        accountHolderAddress: '1200 Pine St, Suite 4\nSeattle, WA 98101',
        bankName: 'First Federal Bank',
        bankAddress: '1 Federal Plaza\nNew York, NY 10007',
        accountNumber: '000123456789',
        routingNumber: null,
        accountType: null,
        iban: null,
        swiftBic: 'FFBKUS33',
        localCodeLabel: null,
        localCode: null,
        intermediaryBankName: null,
        intermediarySwiftBic: null,
        intermediaryAccountNumber: null,
        paymentLinkLabel: null,
        paymentLinkUrl: null,
        currency: 'USD',
        feeAllocation: 'SHA',
        notes: null,
        archivedAt: null,
      },
    ],
  };
}

function task(projectId: string, i: number) {
  const names = TASKS[projectId] as string[];
  return names[i % names.length] as string;
}

interface InvoiceSpec {
  seq: number;
  clientId: string;
  status: Invoice['status'];
  period: [string, string];
  issued: string;
  due: string;
  paid?: string;
  /** For a period older than the entries: one line, this many hours. */
  hours?: number;
}

/* Fixed dates rather than relative ones: an invoice's period is a month the
   user can name, and the stories pin the clock to NOW in `time.mts`. */
const INVOICES: InvoiceSpec[] = [
  {
    seq: 5,
    clientId: ids.oldEngagement,
    status: 'paid',
    period: ['2026-03-01', '2026-03-31'],
    issued: '2026-04-01',
    due: '2026-05-01',
    paid: '2026-04-20',
    hours: 42,
  },
  {
    seq: 6,
    clientId: ids.northwind,
    status: 'paid',
    period: ['2026-04-01', '2026-04-30'],
    issued: '2026-05-01',
    due: '2026-05-31',
    paid: '2026-05-22',
    hours: 58,
  },
  {
    seq: 7,
    clientId: ids.meridian,
    status: 'paid',
    period: ['2026-05-01', '2026-05-31'],
    issued: '2026-06-01',
    due: '2026-07-01',
    paid: '2026-06-26',
    hours: 36,
  },
  {
    seq: 8,
    clientId: ids.northwind,
    status: 'paid',
    period: ['2026-05-01', '2026-05-31'],
    issued: '2026-06-01',
    due: '2026-07-01',
    paid: '2026-06-15',
    hours: 64,
  },
  {
    seq: 9,
    clientId: ids.oldEngagement,
    status: 'void',
    period: ['2026-06-01', '2026-06-30'],
    issued: '2026-07-01',
    due: '2026-07-31',
    hours: 12,
  },
  {
    seq: 10,
    clientId: ids.meridian,
    status: 'paid',
    period: ['2026-06-01', '2026-06-30'],
    issued: '2026-07-01',
    due: '2026-07-31',
    paid: '2026-07-24',
    hours: 48,
  },
  {
    seq: 11,
    clientId: ids.northwind,
    status: 'paid',
    period: ['2026-07-01', '2026-07-31'],
    issued: '2026-08-01',
    due: '2026-08-31',
    paid: '2026-08-14',
    hours: 71,
  },
  {
    seq: 12,
    clientId: ids.meridian,
    status: 'paid',
    period: ['2026-08-01', '2026-08-15'],
    issued: '2026-08-17',
    due: '2026-09-16',
    paid: '2026-09-05',
  },
  // Overdue: 19 days past due, 12 past the grace.
  {
    seq: 13,
    clientId: ids.northwind,
    status: 'sent',
    period: ['2026-08-01', '2026-08-15'],
    issued: '2026-08-15',
    due: '2026-08-29',
  },
  {
    seq: 14,
    clientId: ids.meridian,
    status: 'sent',
    period: ['2026-08-16', '2026-08-31'],
    issued: '2026-09-12',
    due: '2026-10-12',
  },
  // Stale: a draft 12 days old.
  {
    seq: 15,
    clientId: ids.byrne,
    status: 'draft',
    period: ['2026-08-01', '2026-08-31'],
    issued: '2026-09-05',
    due: '2026-10-05',
  },
];

/** Each invoice claims its client's entries in its period, as issuing does. */
function invoicesFor(
  entries: TimeEntry[],
  projects: Project[],
  clients: Client[],
): StoredInvoice[] {
  let line = 5000;
  return INVOICES.map((spec) => {
    const invoiceId = id(300 + spec.seq);
    const who = clients.find((c) => c.id === spec.clientId) as Client;
    const rate = who.hourlyRate ?? settings().defaultHourlyRate ?? 0;
    const [from, to] = spec.period;

    const claimed = entries.filter((e) => {
      const p = projects.find((x) => x.id === e.projectId);
      const date = localDateKey(new Date(e.startedAt), ZONE);
      return (
        p?.clientId === spec.clientId &&
        e.isBillable &&
        date >= from &&
        date <= to
      );
    });
    for (const e of claimed) e.invoiceId = invoiceId;

    // An invoice older than the entries: one line of hours at the rate.
    const lineItems = spec.hours
      ? [
          {
            description: `Development, ${monthName(from)}`,
            unit: 'hour' as const,
            quantity: spec.hours,
            unitPrice: rate,
            amount: spec.hours * rate,
          },
        ]
      : buildLineItems(billable(claimed, projects, clients), {
          groupingMode: 'task',
          tz: ZONE,
        }).lineItems.map(({ rateSource: _, entryIds: __, ...l }) => l);
    const subtotal = lineItems.reduce((sum, l) => sum + l.amount, 0);

    return {
      id: invoiceId,
      clientId: spec.clientId,
      invoiceNumber: formatInvoiceNumber('STINT-', spec.seq),
      sequenceNo: spec.seq,
      status: spec.status,
      issueDate: spec.issued,
      dueDate: spec.due,
      periodStart: from,
      periodEnd: to,
      subtotal,
      taxRate: 0,
      taxAmount: 0,
      expensesSubtotal: 0,
      total: subtotal,
      currency: 'USD',
      notes: null,
      paymentTerms: 'Net 30',
      groupingMode: 'task',
      paymentDetails: null,
      sentAt:
        spec.status === 'draft'
          ? null
          : localDateTimeToInstant(spec.issued, '10:00', ZONE).toISOString(),
      paidAt: spec.paid
        ? localDateTimeToInstant(spec.paid, '11:00', ZONE).toISOString()
        : null,
      createdAt: localDateTimeToInstant(
        spec.issued,
        '09:30',
        ZONE,
      ).toISOString(),
      lineItems: lineItems.map(({ spentOn: _, expenseId: __, ...l }, i) => ({
        ...l,
        spentOn: null,
        id: id(line++),
        sortOrder: i,
      })),
    };
  });
}

/**
 * Costs clients reimburse, one of each state an expense can be in:
 *
 * - Northwind reimburses a subscription on every invoice. August's sent
 *   invoice froze a copy of it; the expense itself is never attached.
 * - Northwind also owes a one-off license from last month, waiting.
 * - Byrne's draft carries one, so it is billed and still editable.
 *
 * A billed expense is a line on its invoice, and the invoice's totals say so.
 */
function expensesFor(invoices: StoredInvoice[]) {
  const expense = (over: Partial<Expense> & Pick<Expense, 'id'>): Expense => ({
    clientId: ids.northwind,
    recurring: false,
    spentOn: '2026-09-05',
    description: '',
    amount: 0,
    note: null,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    ...over,
  });

  const expenses = [
    expense({
      id: ids.claudeMax,
      recurring: true,
      spentOn: null,
      description: 'Claude Max subscription',
      amount: 200,
    }),
    expense({
      id: ids.figma,
      spentOn: '2026-08-20',
      description: 'Figma license, annual',
      amount: 180,
      note: 'Order 88213',
    }),
    expense({
      id: ids.stockPhotos,
      clientId: ids.byrne,
      spentOn: '2026-08-18',
      description: 'Stock photography',
      amount: 75,
    }),
  ];

  const claude = expenses[0] as Expense;
  freeze(invoices, 13, claude, '2026-08-31');
  const photos = expenses[2] as Expense;
  const draft = freeze(invoices, 15, photos, photos.spentOn as string);
  Object.assign(photos, {
    invoiceId: draft.id,
    invoiceNumber: draft.invoiceNumber,
    invoiceStatus: draft.status,
  });
  return expenses;
}

/** An expense's frozen line on an invoice, as generation would have written
 *  it. Attaching the expense is the caller's: a recurring one never is. */
function freeze(
  invoices: StoredInvoice[],
  seq: number,
  e: Expense,
  spentOn: string,
) {
  const invoice = invoices.find((i) => i.sequenceNo === seq) as StoredInvoice;
  invoice.lineItems.push({
    id: id(5900 + seq),
    sortOrder: invoice.lineItems.length,
    description: e.description,
    unit: 'expense',
    quantity: 1,
    unitPrice: e.amount,
    amount: e.amount,
    spentOn,
  });
  invoice.expensesSubtotal += e.amount;
  invoice.total += e.amount;
  return invoice;
}

/** Entries as invoicing reads them: each with its whole rate chain. */
export function billable(
  entries: TimeEntry[],
  projects: Project[],
  clients: Client[],
  userDefaultRate = settings().defaultHourlyRate,
): BillableEntry[] {
  return entries.map((e) => {
    const p = projects.find((x) => x.id === e.projectId);
    const c = clients.find((x) => x.id === p?.clientId);
    return {
      id: e.id,
      taskName: e.taskName,
      projectId: e.projectId,
      projectName: p?.name ?? null,
      startedAt: e.startedAt,
      durationSeconds: e.durationSeconds ?? 0,
      isBillable: e.isBillable,
      rateOverride: e.rateOverride,
      projectRate: p?.hourlyRate ?? null,
      clientRate: c?.hourlyRate ?? null,
      userDefaultRate,
    };
  });
}

function monthName(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
}
