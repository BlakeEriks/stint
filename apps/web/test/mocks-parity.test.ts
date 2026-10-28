/**
 * The fake `/api/v1` the Storybook stories render against
 * (`src/mocks/derive.ts`) must compute what the real routes compute.
 *
 * The stories' own account is written into a real, migrated Postgres, and
 * each route's answer is compared with the fake's for the same instant and
 * zone. A rollup rewritten in one place and not the other fails here, rather
 * than as a story showing numbers the app would never show.
 *
 * Requires DATABASE_URL pointing at a migrated database, like routes.test.ts.
 */
import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { makeDb } from './shim.mjs';
import { addDays, localDateKey, startOfLocalDate } from '@stint/core';
import type { Db } from '../src/mocks/fixtures.ts';
import { getDb, resetDb, type Scenario } from '../src/mocks/db.ts';
import {
  calendar,
  invoicePreview,
  stats,
  summary,
  taskNames,
} from '../src/mocks/derive.ts';
import { id, ids, typedDue } from '../src/mocks/fixtures.ts';
import {
  billingScheduleColumns,
  CLIENT_FIELDS,
  PAYMENT_PROFILE_FIELDS,
  SETTINGS_FIELDS,
  toColumns,
} from '../src/lib/rows.ts';
import { NOW, ZONE } from '../src/mocks/time.mts';

// The user `requireSession` answers with while `__TEST_DB__` is set.
const USER = '11111111-1111-1111-1111-111111111111';
let pool: pg.Pool;

(globalThis as any).__TEST_DB__ = null;

before(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(
    `insert into auth.users (id,email) values ($1,'me@test')
     on conflict do nothing`,
    [USER],
  );
  // Only Date: the pool's own timers must keep running.
  mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
});

after(async () => {
  mock.timers.reset();
  await pool.end();
});

beforeEach(async () => {
  for (const sql of [
    'update time_entries set invoice_id = null where user_id = $1',
    'update expenses set invoice_id = null where user_id = $1',
    'delete from expenses where user_id = $1',
    'delete from time_entries where user_id = $1',
    'delete from invoices where user_id = $1',
    'delete from projects where user_id = $1',
    'delete from clients where user_id = $1',
    'delete from payment_profiles where user_id = $1',
  ])
    await pool.query(sql, [USER]);
  (globalThis as any).__TEST_DB__ = makeDb(pool, USER);
});

/** One row of the account's, as the route would write it. */
async function insert(table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  await pool.query(
    `insert into ${table} (user_id, ${columns}) values ($1, ${columns.map(
      (_, i) => `$${i + 2}`,
    )})`,
    [USER, ...Object.values(row)],
  );
}

/** The fake account, written row for row into Postgres. */
async function write(db: Db) {
  const settings = toColumns(db.settings, SETTINGS_FIELDS);
  await pool.query(
    `insert into user_settings (user_id) values ($1) on conflict do nothing`,
    [USER],
  );
  await pool.query(
    `update user_settings set ${Object.keys(settings)
      .map((c, i) => `${c}=$${i + 2}`)
      .join(', ')} where user_id=$1`,
    [USER, ...Object.values(settings)],
  );
  for (const p of db.paymentProfiles)
    await insert('payment_profiles', {
      ...toColumns(p, PAYMENT_PROFILE_FIELDS, { nullMissing: true }),
      id: p.id,
      archived_at: p.archivedAt,
    });
  for (const c of db.clients)
    await insert('clients', {
      ...toColumns(c, CLIENT_FIELDS),
      ...billingScheduleColumns(c.billingSchedule),
      id: c.id,
      archived_at: c.archivedAt,
    });
  for (const p of db.projects)
    await pool.query(
      `insert into projects (id,user_id,client_id,name,hourly_rate,is_billable_default,archived_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        p.id,
        USER,
        p.clientId,
        p.name,
        p.hourlyRate,
        p.isBillableDefault,
        p.archivedAt,
      ],
    );
  // Drafts first: an issued invoice's entries are locked by a trigger, so
  // they are attached while it is a draft and it is issued after.
  for (const i of db.invoices)
    await insert('invoices', {
      id: i.id,
      client_id: i.clientId,
      invoice_number: i.invoiceNumber,
      sequence_no: i.sequenceNo,
      status: 'draft',
      issue_date: i.issueDate,
      due_date: typedDue(i),
      period_start: i.periodStart,
      period_end: i.periodEnd,
      subtotal: i.subtotal,
      tax_rate: i.taxRate,
      tax_amount: i.taxAmount,
      expenses_subtotal: i.expensesSubtotal,
      total: i.total,
      currency: i.currency,
      notes: i.notes,
      payment_terms: i.paymentTerms,
      grouping_mode: i.groupingMode,
      summary_text: i.summaryText,
      reference: i.reference,
      business_name: i.business.name,
      business_address: i.business.address,
      business_email: i.business.email,
      logo_url: i.business.logoUrl,
      client_name: i.billTo.name,
      client_email: i.billTo.email,
      client_address: i.billTo.address,
      created_at: i.createdAt,
    });
  // Billed while its invoice is still a draft, like entries below.
  for (const e of db.expenses)
    await pool.query(
      `insert into expenses (id,user_id,client_id,recurring,spent_on,description,
         amount,note,invoice_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        e.id,
        USER,
        e.clientId,
        e.recurring,
        e.spentOn,
        e.description,
        e.amount,
        e.note,
        e.invoiceId,
      ],
    );
  for (const e of db.entries)
    await pool.query(
      `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at,
         is_billable,rate_override,invoice_id,duration_ok,invoiced_elsewhere)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        e.id,
        USER,
        e.projectId,
        e.taskName,
        e.startedAt,
        e.endedAt,
        e.isBillable,
        e.rateOverride,
        e.invoiceId,
        e.durationOk,
        e.invoicedElsewhere,
      ],
    );
  // Along the transitions `guard_issued_invoice` allows: paid is reached
  // through sent.
  const path: Record<(typeof db.invoices)[number]['status'], string[]> = {
    draft: [],
    sent: ['sent'],
    paid: ['sent', 'paid'],
    void: ['void'],
  };
  for (const i of db.invoices)
    for (const status of path[i.status])
      await pool.query(
        `update invoices set status=$2, sent_at=$3, paid_at=$4 where id=$1`,
        [i.id, status, i.sentAt, i.paidAt],
      );
}

/* Timestamps compared as instants: one instant is written `+00:00` by
   PostgREST and the test shim, and may be written `Z` by the fake. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
const instants = (_: string, v: unknown) =>
  typeof v === 'string' && TIMESTAMP.test(v) ? new Date(v).toISOString() : v;

/** A response, or the fake's answer, as JSON carries it. */
const wire = (value: unknown) => JSON.parse(JSON.stringify(value), instants);

const get = async (route: string, url: string) => {
  const { GET } = await import(`../src/app/api/v1/${route}/route.ts`);
  const res: Response = await GET(new Request(`http://t${url}`));
  assert.equal(res.status, 200, `${url} answered ${res.status}`);
  return wire(await res.json());
};

const scenarios: Scenario[] = ['seeded', 'running', 'empty'];

for (const scenario of scenarios)
  test(`the fake API agrees with the routes: ${scenario}`, async () => {
    resetDb(new Date(NOW), scenario);
    const db = getDb();
    await write(db);
    const tz = encodeURIComponent(ZONE);

    assert.deepEqual(
      await get('summary', `/api/v1/summary?tz=${tz}`),
      wire(summary(db, ZONE)),
    );
    assert.deepEqual(
      await get('stats', `/api/v1/stats?tz=${tz}`),
      wire(stats(db, ZONE)),
    );

    // The six weeks the account covers.
    const today = localDateKey(new Date(NOW), ZONE);
    const from = startOfLocalDate(addDays(today, -44), ZONE).toISOString();
    const to = startOfLocalDate(addDays(today, 1), ZONE).toISOString();
    assert.deepEqual(
      (await get('calendar', `/api/v1/calendar?from=${from}&to=${to}&tz=${tz}`))
        .days,
      wire(calendar(db, { from, to, tz: ZONE })),
    );

    for (const projectId of [null, ids.rush])
      assert.deepEqual(
        (
          await get(
            'entries/task-names',
            `/api/v1/entries/task-names${projectId ? `?projectId=${projectId}` : ''}`,
          )
        ).taskNames,
        wire(taskNames(db, projectId, 8)),
      );

    // Expenses, monthly ones produced first on both sides.
    const fake = await import('../src/mocks/handlers.ts');
    const fakeGet = async (name: keyof typeof fake.handlers, url: string) => {
      const res = await (fake.handlers[name] as any).resolver({
        request: new Request(`http://t${url}`),
        params: {},
      });
      return wire(await res.json());
    };
    for (const q of ['', 'status=unbilled', `clientId=${ids.northwind}`])
      assert.deepEqual(
        await get('expenses', `/api/v1/expenses?${q}`),
        await fakeGet('expenses', `/api/v1/expenses?${q}`),
        `expenses?${q}`,
      );

    if (scenario === 'empty') return;
    const { POST } = await import(
      '../src/app/api/v1/invoices/preview/route.ts'
    );
    for (const grouping of [
      { groupingMode: 'task' as const },
      { groupingMode: 'summary' as const, summaryText: 'Consulting services' },
    ]) {
      const body = {
        clientId: ids.northwind,
        periodStart: addDays(today, -30),
        periodEnd: today,
        ...grouping,
        tz: ZONE,
      };
      const res: Response = await POST(
        new Request('http://t/api/v1/invoices/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      assert.deepEqual(
        wire(await res.json()),
        wire(invoicePreview(db, body, ZONE)),
        grouping.groupingMode,
      );
    }
  });

/* Writes: each case sent to the route against Postgres and to the fake, from
   the same account. They must agree on what they refuse and what they
   answer, and the account must read the same after. */

const fake = await import('../src/mocks/handlers.ts');
type Handler = keyof typeof fake.handlers;

interface Write {
  handler: Handler;
  /** The route's folder under `api/v1`, as `entries/[id]`. */
  route: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  params?: Record<string, string>;
  body?: unknown;
  /** Response fields only the database decides, such as a new row's id. */
  omit?: string[];
  /** A second write, `at` that instant, on what the first created. */
  followUp?: { at: string; write: (id: string) => Write };
}

const invoice = (seq: number) => id(300 + seq);
const billedOn = (db: Db, seq: number) =>
  db.entries.find((e) => e.invoiceId === invoice(seq))!.id;
const running = 'running' as const;
const later = '2026-09-18T12:00:00.000Z';

const writes: Record<string, [Scenario, (db: Db) => Write]> = {
  'start a timer': [
    'seeded',
    () => ({
      handler: 'startTimer',
      route: 'timer/start',
      method: 'POST',
      url: '/api/v1/timer/start',
      body: { id: id(9100), taskName: 'Spec review', projectId: ids.rush },
    }),
  ],
  'start a second timer': [
    running,
    () => ({
      handler: 'startTimer',
      route: 'timer/start',
      method: 'POST',
      url: '/api/v1/timer/start',
      body: { taskName: 'Spec review' },
    }),
  ],
  'stop the timer': [
    running,
    () => ({
      handler: 'stopTimer',
      route: 'timer/stop',
      method: 'POST',
      url: '/api/v1/timer/stop',
      body: {},
    }),
  ],
  'stop the timer before it started': [
    running,
    () => ({
      handler: 'stopTimer',
      route: 'timer/stop',
      method: 'POST',
      url: '/api/v1/timer/stop',
      body: { endedAt: '2026-09-17T12:00:00.000Z' },
    }),
  ],
  'stop with no timer': [
    'seeded',
    () => ({
      handler: 'stopTimer',
      route: 'timer/stop',
      method: 'POST',
      url: '/api/v1/timer/stop',
      body: {},
    }),
  ],
  'rename with no timer': [
    'seeded',
    () => ({
      handler: 'updateRunning',
      route: 'timer/current',
      method: 'PATCH',
      url: '/api/v1/timer/current',
      body: { taskName: 'Renamed' },
    }),
  ],
  'add an entry': [
    'seeded',
    () => ({
      handler: 'createEntry',
      route: 'entries',
      method: 'POST',
      url: '/api/v1/entries',
      body: {
        id: id(9200),
        taskName: 'Backfill',
        projectId: ids.admin,
        startedAt: '2026-09-16T14:00:00.000Z',
        endedAt: '2026-09-16T15:00:00.000Z',
      },
    }),
  ],
  'edit a billed entry': [
    'seeded',
    (db) => ({
      handler: 'updateEntry',
      route: 'entries/[id]',
      method: 'PATCH',
      url: `/api/v1/entries/${billedOn(db, 13)}`,
      params: { id: billedOn(db, 13) },
      body: { taskName: 'Renamed' },
    }),
  ],
  'end an entry before it starts': [
    'seeded',
    (db) => ({
      handler: 'updateEntry',
      route: 'entries/[id]',
      method: 'PATCH',
      url: `/api/v1/entries/${db.entries.at(-1)!.id}`,
      params: { id: db.entries.at(-1)!.id },
      body: { endedAt: db.entries.at(-1)!.startedAt },
    }),
  ],
  'mark an invoiced entry billed elsewhere': [
    'seeded',
    (db) => ({
      handler: 'updateEntry',
      route: 'entries/[id]',
      method: 'PATCH',
      url: `/api/v1/entries/${billedOn(db, 13)}`,
      params: { id: billedOn(db, 13) },
      body: { invoicedElsewhere: true },
    }),
  ],
  'mark a running entry billed elsewhere': [
    running,
    () => ({
      handler: 'updateEntry',
      route: 'entries/[id]',
      method: 'PATCH',
      url: `/api/v1/entries/${id(9000)}`,
      params: { id: id(9000) },
      body: { invoicedElsewhere: true },
    }),
  ],
  'edit a missing entry': [
    'seeded',
    () => ({
      handler: 'updateEntry',
      route: 'entries/[id]',
      method: 'PATCH',
      url: `/api/v1/entries/${id(9999)}`,
      params: { id: id(9999) },
      body: { taskName: 'Renamed' },
    }),
  ],
  'delete a billed entry': [
    'seeded',
    (db) => ({
      handler: 'deleteEntry',
      route: 'entries/[id]',
      method: 'DELETE',
      url: `/api/v1/entries/${billedOn(db, 13)}`,
      params: { id: billedOn(db, 13) },
    }),
  ],
  'delete a missing entry': [
    'seeded',
    () => ({
      handler: 'deleteEntry',
      route: 'entries/[id]',
      method: 'DELETE',
      url: `/api/v1/entries/${id(9999)}`,
      params: { id: id(9999) },
    }),
  ],
  'mark several billed elsewhere': [
    running,
    (db) => ({
      handler: 'markInvoicedElsewhere',
      route: 'entries/invoiced-elsewhere',
      method: 'POST',
      url: '/api/v1/entries/invoiced-elsewhere',
      body: {
        ids: [billedOn(db, 13), id(9000), db.entries.at(-2)!.id],
        invoicedElsewhere: true,
      },
    }),
  ],
  'invoice a reversed period': [
    'seeded',
    () => ({
      handler: 'createInvoice',
      route: 'invoices',
      method: 'POST',
      url: '/api/v1/invoices',
      body: {
        clientId: ids.northwind,
        periodStart: '2026-09-10',
        periodEnd: '2026-09-01',
        tz: ZONE,
      },
    }),
  ],
  'invoice over a draft': [
    'seeded',
    () => ({
      handler: 'createInvoice',
      route: 'invoices',
      method: 'POST',
      url: '/api/v1/invoices',
      body: {
        clientId: ids.byrne,
        periodStart: '2026-08-15',
        periodEnd: '2026-09-15',
        tz: ZONE,
      },
    }),
  ],
  'invoice due before today': [
    'seeded',
    () => ({
      handler: 'createInvoice',
      route: 'invoices',
      method: 'POST',
      url: '/api/v1/invoices',
      body: {
        clientId: ids.northwind,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-15',
        dueDate: '2026-09-01',
        tz: ZONE,
      },
    }),
  ],
  'invoice nothing': [
    'seeded',
    () => ({
      handler: 'createInvoice',
      route: 'invoices',
      method: 'POST',
      url: '/api/v1/invoices',
      body: {
        clientId: ids.oldEngagement,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-15',
        tz: ZONE,
      },
    }),
  ],
  'invoice a client': [
    'seeded',
    () => ({
      handler: 'createInvoice',
      route: 'invoices',
      method: 'POST',
      url: '/api/v1/invoices',
      body: {
        clientId: ids.northwind,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-15',
        tz: ZONE,
      },
      omit: ['id', 'createdAt'],
    }),
  ],
  'send a draft a day after generating it': [
    'seeded',
    () => ({
      handler: 'createInvoice',
      route: 'invoices',
      method: 'POST',
      url: '/api/v1/invoices',
      body: {
        clientId: ids.northwind,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-15',
        tz: ZONE,
      },
      omit: ['id', 'createdAt'],
      followUp: {
        at: '2026-09-18T15:00:00.000Z',
        write: (invoiceId) => ({
          handler: 'updateInvoiceStatus',
          route: 'invoices/[id]/status',
          method: 'PATCH',
          url: `/api/v1/invoices/${invoiceId}/status?tz=${encodeURIComponent(ZONE)}`,
          params: { id: invoiceId },
          body: { status: 'sent' },
          omit: ['id', 'createdAt'],
        }),
      },
    }),
  ],
  'send an empty draft': [
    (db) => {
      const draft = db.invoices.find((i) => i.id === invoice(15))!;
      Object.assign(draft, {
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      });
      db.expenses = db.expenses.filter((e) => e.id !== ids.stockPhotos);
    },
    () => ({
      handler: 'updateInvoiceStatus',
      route: 'invoices/[id]/status',
      method: 'PATCH',
      url: `/api/v1/invoices/${invoice(15)}/status?tz=${encodeURIComponent(ZONE)}`,
      params: { id: invoice(15) },
      body: { status: 'sent' },
    }),
  ],
  'send a draft': [
    'seeded',
    () => ({
      handler: 'updateInvoiceStatus',
      route: 'invoices/[id]/status',
      method: 'PATCH',
      url: `/api/v1/invoices/${invoice(15)}/status?tz=${encodeURIComponent(ZONE)}`,
      params: { id: invoice(15) },
      body: { status: 'sent' },
    }),
  ],
  'void a sent invoice': [
    'seeded',
    () => ({
      handler: 'updateInvoiceStatus',
      route: 'invoices/[id]/status',
      method: 'PATCH',
      url: `/api/v1/invoices/${invoice(13)}/status`,
      params: { id: invoice(13) },
      body: { status: 'void' },
    }),
  ],
  'send a paid invoice': [
    'seeded',
    () => ({
      handler: 'updateInvoiceStatus',
      route: 'invoices/[id]/status',
      method: 'PATCH',
      url: `/api/v1/invoices/${invoice(11)}/status`,
      params: { id: invoice(11) },
      body: { status: 'sent' },
    }),
  ],
  'pay a void invoice': [
    'seeded',
    () => ({
      handler: 'updateInvoiceStatus',
      route: 'invoices/[id]/status',
      method: 'PATCH',
      url: `/api/v1/invoices/${invoice(9)}/status`,
      params: { id: invoice(9) },
      body: { status: 'paid' },
    }),
  ],
  'paid tomorrow': [
    'seeded',
    () => ({
      handler: 'updateInvoiceStatus',
      route: 'invoices/[id]/status',
      method: 'PATCH',
      url: `/api/v1/invoices/${invoice(13)}/status`,
      params: { id: invoice(13) },
      body: { status: 'paid', paidAt: later },
    }),
  ],
  'paid before it was sent': [
    'seeded',
    () => ({
      handler: 'updateInvoiceStatus',
      route: 'invoices/[id]/status',
      method: 'PATCH',
      url: `/api/v1/invoices/${invoice(13)}/status`,
      params: { id: invoice(13) },
      body: { status: 'paid', paidAt: '2026-08-01T12:00:00.000Z' },
    }),
  ],
  'delete a draft': [
    'seeded',
    () => ({
      handler: 'deleteInvoice',
      route: 'invoices/[id]',
      method: 'DELETE',
      url: `/api/v1/invoices/${invoice(15)}`,
      params: { id: invoice(15) },
    }),
  ],
  'add an expense': [
    'seeded',
    () => ({
      handler: 'createExpense',
      route: 'expenses',
      method: 'POST',
      url: '/api/v1/expenses',
      body: {
        id: id(9300),
        clientId: ids.meridian,
        description: 'Train fare',
        amount: 42.5,
        spentOn: '2026-09-10',
      },
    }),
  ],
  'add a recurring expense with a date': [
    'seeded',
    () => ({
      handler: 'createExpense',
      route: 'expenses',
      method: 'POST',
      url: '/api/v1/expenses',
      body: {
        id: id(9300),
        clientId: ids.meridian,
        description: 'Hosting',
        amount: 20,
        recurring: true,
        spentOn: '2026-09-10',
      },
    }),
  ],
  'edit a billed expense': [
    (db) => {
      db.expenses.find((e) => e.id === ids.figma)!.invoiceId = invoice(13);
    },
    () => ({
      handler: 'updateExpense',
      route: 'expenses/[id]',
      method: 'PATCH',
      url: `/api/v1/expenses/${ids.figma}`,
      params: { id: ids.figma },
      body: { amount: 1 },
    }),
  ],
  'make a drafted expense recurring': [
    (db) => {
      db.expenses.find((e) => e.id === ids.stockPhotos)!.invoiceId =
        invoice(15);
    },
    () => ({
      handler: 'updateExpense',
      route: 'expenses/[id]',
      method: 'PATCH',
      url: `/api/v1/expenses/${ids.stockPhotos}`,
      params: { id: ids.stockPhotos },
      body: { recurring: true },
    }),
  ],
  'make a recurring expense one-off without a date': [
    'seeded',
    () => ({
      handler: 'updateExpense',
      route: 'expenses/[id]',
      method: 'PATCH',
      url: `/api/v1/expenses/${ids.claudeMax}`,
      params: { id: ids.claudeMax },
      body: { recurring: false },
    }),
  ],
  'delete a billed expense': [
    (db) => {
      db.expenses.find((e) => e.id === ids.figma)!.invoiceId = invoice(13);
    },
    () => ({
      handler: 'deleteExpense',
      route: 'expenses/[id]',
      method: 'DELETE',
      url: `/api/v1/expenses/${ids.figma}`,
      params: { id: ids.figma },
    }),
  ],
  'move the next number onto a used one': [
    'seeded',
    () => ({
      handler: 'updateSettings',
      route: 'settings',
      method: 'PATCH',
      url: '/api/v1/settings',
      body: { nextInvoiceNumber: 3 },
    }),
  ],
  'rename a missing project': [
    'seeded',
    () => ({
      handler: 'updateProject',
      route: 'projects/[id]',
      method: 'PATCH',
      url: `/api/v1/projects/${id(9999)}`,
      params: { id: id(9999) },
      body: { name: 'Renamed' },
    }),
  ],
  'archive a client': [
    'seeded',
    () => ({
      handler: 'archiveClient',
      route: 'clients/[id]',
      method: 'DELETE',
      url: `/api/v1/clients/${ids.byrne}`,
      params: { id: ids.byrne },
    }),
  ],
  'add a second payment profile as default': [
    'seeded',
    () => ({
      handler: 'createPaymentProfile',
      route: 'payment-profiles',
      method: 'POST',
      url: '/api/v1/payment-profiles',
      body: { id: id(9400), name: 'Savings', isDefault: true },
    }),
  ],
  'archive the default payment profile': [
    'seeded',
    () => ({
      handler: 'archivePaymentProfile',
      route: 'payment-profiles/[id]',
      method: 'DELETE',
      url: `/api/v1/payment-profiles/${ids.ach}`,
      params: { id: ids.ach },
    }),
  ],
};

const request = ({ method, url, body }: Write) =>
  new Request(`http://t${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function answer(res: Response) {
  const text = await res.text();
  return { status: res.status, body: text ? wire(JSON.parse(text)) : null };
}

/** The same write to the route and to the fake. */
async function both(real: Write, faked: Write) {
  const route = await import(`../src/app/api/v1/${real.route}/route.ts`);
  const ctx = { params: Promise.resolve(real.params ?? {}) };
  return {
    real: await answer(await route[real.method](request(real), ctx)),
    faked: await answer(
      await (fake.handlers[faked.handler] as any).resolver({
        request: request(faked),
        params: faked.params ?? {},
      }),
    ),
  };
}

/** Both answers agree, but for the fields only the database decides. */
function agree(a: { real: any; faked: any }, omit: string[] = []) {
  for (const side of [a.real, a.faked])
    for (const key of omit) delete side.body?.[key];
  assert.deepEqual(a.faked, a.real);
}

/** The account as the screens read it. */
async function account(db: Db) {
  const fakeRead = async (name: Handler, url: string) => {
    const res = await (fake.handlers[name] as any).resolver({
      request: new Request(`http://t${url}`),
      params: {},
    });
    return wire(await res.json());
  };
  const reads: [string, Handler, string][] = [
    ['entries', 'entries', '/api/v1/entries?limit=500'],
    ['expenses', 'expenses', '/api/v1/expenses'],
    ['payment-profiles', 'paymentProfiles', '/api/v1/payment-profiles'],
    ['clients', 'clients', '/api/v1/clients'],
  ];
  const real: unknown[] = [await get('summary', `/api/v1/summary?tz=${ZONE}`)];
  const faked: unknown[] = [wire(summary(db, ZONE))];
  for (const [route, handler, url] of reads) {
    real.push(await get(route, url));
    faked.push(await fakeRead(handler, url));
  }
  return { real, faked };
}

for (const [name, [scenario, make]] of Object.entries(writes))
  test(`the fake API writes as the routes do: ${name}`, async (t) => {
    resetDb(new Date(NOW), scenario);
    const db = getDb();
    await write(db);
    const w = make(db);
    const first = await both(w, w);
    const ids = { real: first.real.body?.id, faked: first.faked.body?.id };
    agree(first, w.omit);
    if (w.followUp) {
      t.after(() => mock.timers.setTime(Date.parse(NOW)));
      mock.timers.setTime(Date.parse(w.followUp.at));
      db.now = new Date(w.followUp.at);
      const next = w.followUp.write(ids.real);
      agree(await both(next, w.followUp.write(ids.faked)), next.omit);
    }
    const after = await account(db);
    // A row each side created carries its own id.
    const faked = JSON.stringify(after.faked);
    assert.deepEqual(
      JSON.parse(ids.faked ? faked.replaceAll(ids.faked, ids.real) : faked),
      after.real,
    );
  });
