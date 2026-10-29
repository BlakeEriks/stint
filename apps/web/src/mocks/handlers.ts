import {
  buildPaymentDetails,
  buildPreview,
  draftDates,
  entryOrderRefusal,
  invoiceRequestRefusal,
  nothingToSend,
  nextNumberRefusal,
  paidAtRefusal,
  pricedInvoiceRefusal,
  refusals,
  resolvePaymentProfile,
  stopOrderRefusal,
  unratedRefusal,
  documentOpens,
  entriesCsv,
  invoicesCsv,
  measured,
  formatInvoiceNumber,
  localDateKey,
  paymentTermsText,
  pickSchedules,
  type ImportPreview,
  type ImportResult,
  parseExport,
  uuidv7,
} from '@stint/core';
import { http, HttpResponse } from 'msw';
import type { z } from 'zod';
import type {
  Client,
  Expense,
  Invoice,
  PaymentProfile,
  Project,
  TimeEntry,
} from '@/lib/client/api';
import { csvResponse } from '@/lib/exports';
import { getDb } from './db';
import {
  type Db,
  dueBeforeIssue,
  mockDraftRefusals,
  parties,
  typedDue,
} from './fixtures';
import {
  calendar,
  expenseView,
  invoicePreview,
  type PreviewRequest,
  stats,
  summary,
  taskNames,
  unbilledSummary,
  withScale,
} from './derive';
import {
  createdInvoice,
  envelopes,
  fail,
  invoiceDetail,
  missing,
  noContent,
  ok,
  parse,
  refuse,
  schema,
} from './respond';
import { ZONE } from './time.mts';

/**
 * The whole of `/api/v1`, in memory, one handler per call in `api.ts`.
 *
 * Keyed so a story replaces exactly one: `parameters.msw.handlers.stats` set
 * to a 500 breaks the figures and leaves the rest of the screen working.
 * Each handler reads the account when the request arrives, so the reset
 * before every story is what it serves.
 */

const API = '/api/v1';
const query = (request: Request) => new URL(request.url).searchParams;
const body = <T>(request: Request) => request.json() as Promise<T>;
const byId = <T extends { id: string }>(rows: T[], id: unknown) =>
  rows.find((r) => r.id === id);
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

function applyArchived<T>(
  db: { now: Date },
  { archived, ...patch }: T & { archived?: boolean },
): T {
  if (archived === undefined) return patch as T;
  return {
    ...patch,
    archivedAt: archived ? db.now.toISOString() : null,
  } as T;
}

type CreateInvoice = z.infer<typeof schema.CreateInvoice>;
type Preview = NonNullable<ReturnType<typeof invoicePreview>>;

/** The invoice holding the highest number, drafts included. */
const highestInvoice = (db: Db) =>
  db.invoices.reduce<Db['invoices'][number] | undefined>(
    (top, i) => (top && top.sequenceNo > i.sequenceNo ? top : i),
    undefined,
  );

function invoiceRow(db: Db, input: CreateInvoice, preview: Preview) {
  const seq = db.settings.nextInvoiceNumber;
  db.settings.nextInvoiceNumber += 1;
  const issueDate = localDateKey(db.now, input.tz);
  const days =
    db.clients.find((c) => c.id === preview.clientId)?.paymentTermsDays ??
    db.settings.paymentTermsDays;
  const { dueDate } = draftDates({
    issueDate,
    dueDate: input.dueDate ?? null,
    paymentTerms: null,
    defaultTermsDays: days,
    printed: null,
  });
  return {
    id: uuidv7(db.now.getTime()),
    clientId: preview.clientId,
    invoiceNumber: formatInvoiceNumber(db.settings.invoiceNumberPrefix, seq),
    sequenceNo: seq,
    status: 'draft' as const,
    issueDate,
    dueDate,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    subtotal: preview.subtotal,
    taxRate: preview.taxRate,
    taxAmount: preview.taxAmount,
    expensesSubtotal: preview.expensesSubtotal,
    total: preview.total,
    currency: preview.currency,
    notes: input.notes ?? null,
    paymentTerms: paymentTermsText(issueDate, dueDate),
    typedDueDate: input.dueDate ?? null,
    excludedExpenseIds: input.excludedExpenseIds ?? [],
    groupingMode: preview.groupingMode,
    summaryText: preview.groupingMode === 'summary' ? input.summaryText : null,
    reference: input.reference ?? null,
    supportingDetail: preview.schedules
      ? pickSchedules(preview.schedules, input.schedules)
      : null,
    paymentDetails: null,
    ...parties(db.settings, byId(db.clients, preview.clientId) as Client),
    sentAt: null,
    paidAt: null,
    createdAt: db.now.toISOString(),
  };
}

function claimBilled(db: Db, invoiceId: string, preview: Preview) {
  const claimed = new Set(preview.lineItems.flatMap((l) => l.entryIds));
  for (const e of db.entries) if (claimed.has(e.id)) e.invoiceId = invoiceId;
  // One-offs only: a recurring expense bills again on the next invoice.
  const billed = new Set(preview.lineItems.map((l) => l.expenseId));
  for (const e of db.expenses)
    if (billed.has(e.id) && !e.recurring) e.invoiceId = invoiceId;
}

type StoredInvoice = Db['invoices'][number];

/** An invoice as the list and status routes answer it. */
const listed = ({
  lineItems: _,
  changedSinceDownload: __,
  unratedEntries: ___,
  dueBeforeIssue: ____,
  typedDueDate: _____,
  excludedExpenseIds: ______,
  ...invoice
}: StoredInvoice) => invoice;

/** `lib/drafts.ts`'s `sendDraft`: the draft as its period stands at
 *  `sentAt`, priced, dated, claimed and sent. */
function sendDraft(
  db: Db,
  invoice: StoredInvoice,
  sentAt: string,
  tz: string | null,
) {
  const zone = tz ?? ZONE;
  const preview = invoicePreview(
    db,
    {
      clientId: invoice.clientId,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      groupingMode: invoice.groupingMode,
      summaryText: invoice.summaryText ?? undefined,
      excludedExpenseIds: invoice.excludedExpenseIds,
      draftId: invoice.id,
    },
    zone,
  );
  if (!preview) return missing('Invoice');
  if (preview.unratedEntryIds.length > 0)
    return refuse(unratedRefusal(preview.unratedEntryIds));
  if (preview.lineItems.length === 0) return refuse(nothingToSend);
  if (invoice.changedSinceDownload)
    return fail(
      'DRAFT_CHANGED',
      'This draft changed since you downloaded it. Download the new PDF, send that one, then mark it sent.',
      invoice.changedSinceDownload,
    );
  const { sent } = draftDates({
    issueDate: localDateKey(new Date(sentAt), zone),
    dueDate: typedDue(invoice),
    paymentTerms: invoice.paymentTerms,
    defaultTermsDays: db.settings.paymentTermsDays,
    printed: null,
  });
  claimBilled(db, invoice.id, preview);
  Object.assign(invoice, {
    status: 'sent',
    sentAt,
    issueDate: sent.issueDate,
    dueDate: sent.dueDate,
    paymentTerms: paymentTermsText(sent.issueDate, sent.dueDate),
    subtotal: preview.subtotal,
    taxRate: preview.taxRate,
    taxAmount: preview.taxAmount,
    expensesSubtotal: preview.expensesSubtotal,
    total: preview.total,
  });
  return ok(schema.Invoice, listed(invoice));
}

/** An issued invoice paid or voided. Voiding releases its work to bill
 *  again, as `release_voided_invoice` does. */
function moveIssued(
  db: Db,
  invoice: StoredInvoice,
  status: Invoice['status'],
  paidAt = db.now.toISOString(),
) {
  invoice.status = status;
  if (status === 'paid') invoice.paidAt = paidAt;
  if (status === 'void')
    for (const e of [...db.entries, ...db.expenses])
      if (e.invoiceId === invoice.id) e.invoiceId = null;
}

/** `toColumns(..., { nullMissing: true })`: every field the form left out. */
const EMPTY_PROFILE: Omit<PaymentProfile, 'id' | 'name' | 'isDefault'> = {
  accountHolderName: null,
  accountHolderAddress: null,
  bankName: null,
  bankAddress: null,
  accountNumber: null,
  routingNumber: null,
  accountType: null,
  iban: null,
  swiftBic: null,
  localCodeLabel: null,
  localCode: null,
  intermediaryBankName: null,
  intermediarySwiftBic: null,
  intermediaryAccountNumber: null,
  paymentLinkLabel: null,
  paymentLinkUrl: null,
  currency: null,
  feeAllocation: null,
  notes: null,
  archivedAt: null,
};

function stopEntry(entry: TimeEntry, endedAt: string): TimeEntry {
  const seconds = Math.floor(
    (Date.parse(endedAt) - Date.parse(entry.startedAt)) / 1000,
  );
  return { ...entry, endedAt, durationSeconds: seconds };
}

/** As `lib/projects.ts`: unset, an entry takes its project's default. */
const billableDefault = (db: Db, projectId: string | null | undefined) =>
  byId(db.projects, projectId)?.isBillableDefault ?? true;

/** Moves `guard_issued_invoice` allows. */
const TRANSITIONS: Record<Invoice['status'], Invoice['status'][]> = {
  draft: ['sent', 'void'],
  sent: ['paid', 'void'],
  paid: ['void'],
  void: [],
};

/** `loadPaymentProfile`'s: the one picked, else the client's, else the
 *  default; null when the picked one is archived or gone. */
function paymentProfile(db: Db, clientId: string, chosenId?: string) {
  const live = db.paymentProfiles.filter((p) => !p.archivedAt);
  if (chosenId) return live.find((p) => p.id === chosenId) ?? null;
  return resolvePaymentProfile(live, {
    clientProfileId: byId(db.clients, clientId)?.paymentProfileId,
    defaultProfileId: live.find((p) => p.isDefault)?.id,
  });
}

function withDuration(entry: TimeEntry): TimeEntry {
  if (!entry.endedAt) return { ...entry, durationSeconds: null };
  return {
    ...entry,
    durationSeconds: Math.round(
      (Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000,
    ),
  };
}

/** `lib/import.ts`'s `readImport`, against the fake account. */
async function importPreview(
  request: Request,
): Promise<ImportPreview | Response> {
  const db = getDb();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File))
    return fail('VALIDATION_FAILED', 'Send exactly one file as "file"');
  const parsed = parseExport(await file.text());
  if (!parsed.ok) return fail('IMPORT_FILE_UNRECOGNIZED', parsed.reason);
  const read = (name: string) => {
    const raw = form.get(name);
    return raw ? JSON.parse(String(raw)) : undefined;
  };
  return buildPreview(parsed.source, parsed.rows, {
    userId: 'storybook',
    allBillable: form.get('allBillable') === 'true',
    choices: read('clients') ?? {},
    excluded: read('excluded') ?? [],
    existing: db.entries
      .filter((e) => e.endedAt)
      .map((e) => ({
        id: e.id,
        taskName: e.taskName,
        startedAt: e.startedAt,
        endedAt: e.endedAt as string,
      })),
    timeZone: String(form.get('timeZone') ?? ZONE),
    defaultRate: db.settings.defaultHourlyRate,
    clients: db.clients.map((c) => ({
      id: c.id,
      name: c.name,
      hourlyRate: c.hourlyRate,
      color: c.color,
      archived: c.archivedAt !== null,
    })),
    projects: db.projects.map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      hourlyRate: p.hourlyRate,
      isBillableDefault: p.isBillableDefault,
      archived: p.archivedAt !== null,
    })),
  });
}

export const handlers = {
  summary: http.get(`${API}/summary`, ({ request }) =>
    ok(schema.Summary, summary(getDb(), query(request).get('tz') ?? ZONE)),
  ),

  stats: http.get(`${API}/stats`, ({ request }) =>
    ok(schema.Stats, stats(getDb(), query(request).get('tz') ?? ZONE)),
  ),

  calendar: http.get(`${API}/calendar`, ({ request }) => {
    const q = query(request);
    const days = calendar(getDb(), {
      from: q.get('from') ?? '',
      to: q.get('to') ?? '',
      tz: q.get('tz') ?? ZONE,
    });
    return ok(envelopes.calendar, { days } as never);
  }),

  startTimer: http.post(`${API}/timer/start`, async ({ request }) => {
    const db = getDb();
    const running = db.entries.find((e) => e.endedAt === null);
    if (running) return refuse(refusals.timerRunning(running));
    const input = await body<{
      id?: string;
      taskName: string;
      projectId?: string | null;
      startedAt?: string;
      isBillable?: boolean;
    }>(request);
    const entry: TimeEntry = {
      id: input.id ?? uuidv7(db.now.getTime()),
      projectId: input.projectId ?? null,
      taskName: input.taskName,
      startedAt: input.startedAt ?? db.now.toISOString(),
      endedAt: null,
      isBillable: input.isBillable ?? billableDefault(db, input.projectId),
      rateOverride: null,
      invoiceId: null,
      durationSeconds: null,
      durationOk: false,
      invoicedElsewhere: false,
    };
    db.entries.push(entry);
    return ok(schema.TimeEntry, entry, 201);
  }),

  stopTimer: http.post(`${API}/timer/stop`, async ({ request }) => {
    const db = getDb();
    const i = db.entries.findIndex((e) => e.endedAt === null);
    const running = db.entries[i];
    if (!running) return refuse(refusals.noTimer);
    const { endedAt = db.now.toISOString() } = await body<{
      endedAt?: string;
    }>(request);
    const backdated = stopOrderRefusal(running.startedAt, endedAt);
    if (backdated) return refuse(backdated);
    const stopped = stopEntry(running, endedAt);
    db.entries[i] = stopped;
    return ok(schema.StoppedTimer, {
      entry: stopped,
      currency: db.settings.currency,
      unbilled: unbilledSummary(db),
    });
  }),

  updateRunning: http.patch(`${API}/timer/current`, async ({ request }) => {
    const db = getDb();
    const i = db.entries.findIndex((e) => e.endedAt === null);
    const running = db.entries[i];
    if (!running) return refuse(refusals.noTimer);
    db.entries[i] = {
      ...running,
      ...(await body<Partial<TimeEntry>>(request)),
    };
    return ok(schema.TimeEntry, db.entries[i]);
  }),

  // Before `entry`: `/entries/:id` would otherwise take `task-names` as an id.
  taskNames: http.get(`${API}/entries/task-names`, ({ request }) => {
    const q = query(request);
    return ok(envelopes.taskNames, {
      taskNames: taskNames(
        getDb(),
        q.get('projectId'),
        Number(q.get('limit') ?? 8),
      ),
    });
  }),

  entries: http.get(`${API}/entries`, ({ request }) => {
    const q = query(request);
    const from = q.get('from');
    const to = q.get('to');
    const projectId = q.get('projectId');
    const db = getDb();
    const entries = db.entries
      .filter(
        (e) =>
          (!from || e.startedAt >= new Date(from).toISOString()) &&
          (!to || e.startedAt <= new Date(to).toISOString()) &&
          (!projectId ||
            e.projectId === (projectId === 'none' ? null : projectId)),
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((e) => measured(e, db.now));
    return ok(envelopes.entries, { entries });
  }),

  entry: http.get(`${API}/entries/:id`, ({ params }) => {
    const entry = byId(getDb().entries, params.id);
    return entry ? ok(schema.TimeEntry, entry) : fail('ENTRY_NOT_FOUND');
  }),

  createEntry: http.post(`${API}/entries`, async ({ request }) => {
    const db = getDb();
    const input = await body<
      Pick<TimeEntry, 'id' | 'taskName' | 'startedAt' | 'endedAt'> &
        Partial<Pick<TimeEntry, 'projectId' | 'isBillable'>>
    >(request);
    const existing = byId(db.entries, input.id);
    if (existing) return ok(schema.TimeEntry, existing);
    const entry = withDuration({
      projectId: null,
      isBillable: billableDefault(db, input.projectId),
      ...input,
      rateOverride: null,
      invoiceId: null,
      durationSeconds: null,
      durationOk: false,
      invoicedElsewhere: false,
    });
    db.entries.push(entry);
    return ok(schema.TimeEntry, entry, 201);
  }),

  updateEntry: http.patch(`${API}/entries/:id`, async ({ params, request }) => {
    const db = getDb();
    const i = db.entries.findIndex((e) => e.id === params.id);
    const entry = db.entries[i];
    if (!entry) return missing('Entry');
    const patch = await body<Partial<TimeEntry>>(request);
    const order = entryOrderRefusal(
      patch.startedAt ?? entry.startedAt,
      patch.endedAt !== undefined ? patch.endedAt : entry.endedAt,
    );
    if (order) return refuse(order);
    // `markable`'s filter, then the lock trigger.
    if (patch.invoicedElsewhere && entry.invoiceId)
      return refuse(refusals.markInvoiced);
    if (patch.invoicedElsewhere && !entry.endedAt)
      return refuse(refusals.markRunning);
    if (byId(db.invoices, entry.invoiceId)?.status.match(/sent|paid|void/))
      return refuse(refusals.entryLocked('modified'));
    db.entries[i] = withDuration({ ...entry, ...patch });
    return ok(schema.TimeEntry, db.entries[i]);
  }),

  markInvoicedElsewhere: http.post(
    `${API}/entries/invoiced-elsewhere`,
    async ({ request }) => {
      const db = getDb();
      const { ids, invoicedElsewhere } = await body<{
        ids: string[];
        invoicedElsewhere: boolean;
      }>(request);
      const changed = db.entries.filter(
        (e) =>
          ids.includes(e.id) &&
          e.invoicedElsewhere !== invoicedElsewhere &&
          (!invoicedElsewhere || (e.invoiceId === null && e.endedAt !== null)),
      );
      for (const e of changed) e.invoicedElsewhere = invoicedElsewhere;
      return ok(envelopes.invoicedElsewhere, {
        ids: changed.map((e) => e.id),
      });
    },
  ),

  deleteEntry: http.delete(`${API}/entries/:id`, ({ params }) => {
    const db = getDb();
    const entry = byId(db.entries, params.id);
    if (!entry) return missing('Entry');
    if (byId(db.invoices, entry.invoiceId)?.status.match(/sent|paid|void/))
      return refuse(refusals.entryLocked('deleted'));
    db.entries = db.entries.filter((e) => e !== entry);
    return noContent();
  }),

  projects: http.get(`${API}/projects`, ({ request }) => {
    const q = query(request);
    const clientId = q.get('clientId');
    const db = getDb();
    // As the route: an archived client's projects count as archived.
    const gone = new Set(
      db.clients.filter((c) => c.archivedAt !== null).map((c) => c.id),
    );
    const projects = db.projects
      .filter(
        (p) =>
          (q.get('includeArchived') === 'true' ||
            (p.archivedAt === null && !(p.clientId && gone.has(p.clientId)))) &&
          (!clientId || p.clientId === clientId),
      )
      .sort(byName);
    return ok(envelopes.projects, { projects });
  }),

  createProject: http.post(`${API}/projects`, async ({ request }) => {
    const db = getDb();
    const input = await body<Partial<Project>>(request);
    const project: Project = {
      id: uuidv7(db.now.getTime()),
      name: '',
      clientId: null,
      hourlyRate: null,
      isBillableDefault: true,
      archivedAt: null,
      ...input,
    };
    db.projects.push(project);
    return ok(schema.Project, project);
  }),

  updateProject: http.patch(
    `${API}/projects/:id`,
    async ({ params, request }) => {
      const db = getDb();
      const i = db.projects.findIndex((p) => p.id === params.id);
      const project = db.projects[i];
      if (!project) return missing('Project');
      db.projects[i] = {
        ...project,
        ...applyArchived(db, await body<Partial<Project>>(request)),
      };
      return ok(schema.Project, db.projects[i]);
    },
  ),

  archiveProject: http.delete(`${API}/projects/:id`, ({ params }) => {
    const db = getDb();
    const project = byId(db.projects, params.id);
    if (!project) return missing('Project');
    project.archivedAt = db.now.toISOString();
    return noContent();
  }),

  clients: http.get(`${API}/clients`, ({ request }) => {
    const db = getDb();
    const q = query(request);
    const clients = db.clients
      .filter(
        (c) => q.get('includeArchived') === 'true' || c.archivedAt === null,
      )
      .sort(byName);
    return q.get('withScale') === 'true'
      ? ok(envelopes.clientsWithScale, { clients: clients.map(withScale(db)) })
      : ok(envelopes.clients, { clients });
  }),

  createClient: http.post(`${API}/clients`, async ({ request }) => {
    const db = getDb();
    const client: Client = {
      id: uuidv7(db.now.getTime()),
      name: '',
      email: null,
      address: null,
      hourlyRate: null,
      taxRate: null,
      currency: null,
      color: null,
      paymentProfileId: null,
      billingSchedule: null,
      paymentTermsDays: null,
      archivedAt: null,
      ...(await body<Partial<Client>>(request)),
    };
    db.clients.push(client);
    return ok(schema.Client, client);
  }),

  updateClient: http.patch(
    `${API}/clients/:id`,
    async ({ params, request }) => {
      const db = getDb();
      const i = db.clients.findIndex((c) => c.id === params.id);
      const client = db.clients[i];
      if (!client) return missing('Client');
      db.clients[i] = {
        ...client,
        ...applyArchived(db, await body<Partial<Client>>(request)),
      };
      return ok(schema.Client, db.clients[i]);
    },
  ),

  archiveClient: http.delete(`${API}/clients/:id`, ({ params }) => {
    const db = getDb();
    const client = byId(db.clients, params.id);
    if (!client) return missing('Client');
    client.archivedAt = db.now.toISOString();
    return noContent();
  }),

  invoices: http.get(`${API}/invoices`, ({ request }) => {
    const clientId = query(request).get('clientId');
    const status = query(request).get('status');
    const invoices = getDb()
      .invoices.filter((i) => !clientId || i.clientId === clientId)
      .filter((i) => !status || i.status === status)
      .map(listed)
      .sort((a, b) => b.sequenceNo - a.sequenceNo);
    return ok(envelopes.invoices, { invoices });
  }),

  invoice: http.get(`${API}/invoices/:id`, ({ params }) => {
    const db = getDb();
    const invoice = byId(db.invoices, params.id);
    if (!invoice) return fail('ENTRY_NOT_FOUND');
    // The fake keeps no plan per invoice: the account's plan decides.
    const { available, plan } = db.billing;
    const {
      changedSinceDownload,
      lineItems,
      unratedEntries,
      dueBeforeIssue: due,
      typedDueDate: _,
      excludedExpenseIds: __,
      ...rest
    } = invoice;
    return ok(invoiceDetail, {
      ...rest,
      lineItems: lineItems.map((l) => ({ ...l, isNew: l.isNew ?? false })),
      canDownload: documentOpens(available, plan, null),
      changedSinceDownload: changedSinceDownload ?? null,
      unratedEntries: unratedEntries ?? [],
      dueBeforeIssue: due ?? dueBeforeIssue(invoice),
      refuses: mockDraftRefusals(invoice),
    });
  }),

  previewInvoice: http.post(`${API}/invoices/preview`, async ({ request }) => {
    const input = await body<PreviewRequest>(request);
    const preview = invoicePreview(getDb(), input, input.tz ?? ZONE);
    return preview
      ? ok(schema.InvoicePreview, preview)
      : fail('ENTRY_NOT_FOUND');
  }),

  createInvoice: http.post(`${API}/invoices`, async ({ request }) => {
    const db = getDb();
    const input = await parse(request, schema.CreateInvoice);
    if (input instanceof Response) return input;
    const asked = invoiceRequestRefusal(input, localDateKey(db.now, input.tz));
    if (asked) return refuse(asked);
    const preview = invoicePreview(db, input, input.tz);
    if (!preview) return missing('Client');
    const priced = pricedInvoiceRefusal(preview, input);
    if (priced) return refuse(priced);
    const profile = paymentProfile(db, input.clientId, input.paymentProfileId);
    if (input.paymentProfileId && !profile)
      return fail(
        'VALIDATION_FAILED',
        'Those payment details are archived or gone. Choose others.',
      );
    // `create_invoice`'s: one open draft per client and date.
    const open = db.invoices.find(
      (i) =>
        i.clientId === input.clientId &&
        i.status === 'draft' &&
        i.periodStart <= input.periodEnd &&
        i.periodEnd >= input.periodStart,
    );
    if (open)
      return fail(
        'DRAFT_OVERLAPS',
        `${open.invoiceNumber} is a draft for these dates already. Open it, or start after it.`,
        {
          invoiceId: open.id,
          invoiceNumber: open.invoiceNumber,
          periodStart: open.periodStart,
          periodEnd: open.periodEnd,
        },
      );
    const row = invoiceRow(db, input, preview);
    const invoice = {
      ...row,
      paymentDetails: buildPaymentDetails(profile, {
        invoiceNumber: row.invoiceNumber,
      }),
    };
    db.invoices.push({
      ...invoice,
      lineItems: preview.lineItems.map(
        ({ rateSource: _, entryIds: __, expenseId: ___, ...l }) => ({
          ...l,
          spentOn: l.spentOn ?? null,
        }),
      ),
    });
    return ok(
      createdInvoice,
      {
        ...invoice,
        lineItems: preview.lineItems,
        entryCount: preview.entryCount,
      },
      201,
    );
  }),

  updateInvoiceStatus: http.patch(
    `${API}/invoices/:id/status`,
    async ({ params, request }) => {
      const db = getDb();
      const invoice = byId(db.invoices, params.id);
      if (!invoice) return missing('Invoice');
      const input = await body<{
        status: typeof invoice.status;
        sentAt?: string;
        paidAt?: string;
      }>(request);
      if (input.status === 'sent' && invoice.status === 'draft')
        return sendDraft(
          db,
          invoice,
          input.sentAt ?? db.now.toISOString(),
          query(request).get('tz'),
        );
      const paid =
        input.status === 'paid' && input.paidAt
          ? paidAtRefusal(input.paidAt, invoice.sentAt, db.now)
          : null;
      if (paid) return refuse(paid);
      if (!TRANSITIONS[invoice.status].includes(input.status))
        return refuse(refusals.transition(invoice.status, input.status));
      moveIssued(db, invoice, input.status, input.paidAt);
      return ok(schema.Invoice, listed(invoice));
    },
  ),

  deleteInvoice: http.delete(`${API}/invoices/:id`, ({ params }) => {
    const db = getDb();
    const invoice = byId(db.invoices, params.id);
    if (!invoice) return missing('Invoice');
    if (invoice.status !== 'draft') return refuse(refusals.issuedDelete);
    db.invoices = db.invoices.filter((i) => i !== invoice);
    return noContent();
  }),

  expenses: http.get(`${API}/expenses`, ({ request }) => {
    const db = getDb();
    const q = query(request);
    const clientId = q.get('clientId');
    const unbilled = q.get('status') === 'unbilled';
    const rows = db.expenses
      .map((e) => expenseView(db, e))
      .filter(
        (e) =>
          (!clientId || e.clientId === clientId) &&
          (unbilled
            ? !e.invoiceId
            : e.invoiceStatus !== 'paid' && e.invoiceStatus !== 'void'),
      )
      // Recurring first, then oldest first, as the route orders them.
      .sort(
        (a, b) =>
          Number(b.recurring) - Number(a.recurring) ||
          (a.spentOn ?? '').localeCompare(b.spentOn ?? ''),
      );
    return ok(envelopes.expenses, { expenses: rows });
  }),

  createExpense: http.post(`${API}/expenses`, async ({ request }) => {
    const db = getDb();
    const input = await parse(request, schema.CreateExpense);
    if (input instanceof Response) return input;
    const existing = byId(db.expenses, input.id);
    if (existing) return ok(schema.Expense, expenseView(db, existing));
    if (!byId(db.clients, input.clientId)) return refuse(refusals.noSuchClient);
    const expense: Expense = {
      note: null,
      ...input,
      spentOn: input.spentOn ?? null,
      invoiceId: null,
      invoiceNumber: null,
      invoiceStatus: null,
    };
    db.expenses.push(expense);
    return ok(schema.Expense, expenseView(db, expense), 201);
  }),

  /* The real file from the account, through the real builders, so a story
     that downloads saves what the app would. */
  exportEntries: http.get(`${API}/exports/entries`, ({ request }) => {
    const db = getDb();
    const tz = query(request).get('tz') ?? ZONE;
    return csvResponse(
      'entries',
      tz,
      entriesCsv(
        {
          ...db,
          defaultRate: db.settings.defaultHourlyRate,
          currency: db.settings.currency,
        },
        tz,
      ),
    );
  }),

  exportInvoices: http.get(`${API}/exports/invoices`, ({ request }) => {
    const tz = query(request).get('tz') ?? ZONE;
    return csvResponse('invoices', tz, invoicesCsv(getDb(), tz));
  }),

  sendFeedback: http.post(`${API}/feedback`, async ({ request }) => {
    const input = schema.CreateFeedback.safeParse(await request.json());
    if (!input.success) return fail('VALIDATION_FAILED');
    return HttpResponse.json({ id: input.data.id }, { status: 201 });
  }),

  updateExpense: http.patch(
    `${API}/expenses/:id`,
    async ({ params, request }) => {
      const db = getDb();
      const expense = byId(db.expenses, params.id);
      if (!expense) return missing('Expense');
      if (expenseView(db, expense).invoiceStatus?.match(/sent|paid|void/))
        return refuse(refusals.expenseLocked('modified'));
      const patch = await body<Partial<Expense>>(request);
      const next = { ...expense, ...patch };
      if (patch.recurring === true) next.spentOn = null;
      if (next.recurring && next.invoiceId)
        return refuse(refusals.billedRecurring);
      if (!next.recurring && next.spentOn == null)
        return refuse(refusals.undatedOneOff);
      Object.assign(expense, next);
      return ok(schema.Expense, expenseView(db, expense));
    },
  ),

  deleteExpense: http.delete(`${API}/expenses/:id`, ({ params }) => {
    const db = getDb();
    const expense = byId(db.expenses, params.id);
    if (!expense) return missing('Expense');
    if (expenseView(db, expense).invoiceStatus?.match(/sent|paid|void/))
      return refuse(refusals.expenseLocked('deleted'));
    db.expenses = db.expenses.filter((e) => e !== expense);
    return noContent();
  }),

  settings: http.get(`${API}/settings`, () =>
    ok(schema.Settings, getDb().settings),
  ),

  updateSettings: http.patch(`${API}/settings`, async ({ request }) => {
    const db = getDb();
    const parsed = schema.UpdateSettings.safeParse(await body(request));
    if (!parsed.success)
      return fail('VALIDATION_FAILED', 'Request body failed validation');
    const input = parsed.data;
    const refused =
      input.nextInvoiceNumber === undefined
        ? null
        : nextNumberRefusal(
            input.nextInvoiceNumber,
            db.settings.nextInvoiceNumber,
            schema.NEXT_INVOICE_NUMBER_MAX,
            highestInvoice(db) ?? null,
          );
    if (refused) return refuse(refused);
    db.settings = { ...db.settings, ...input };
    if (input.paymentTermsDays !== undefined) db.legacyPaymentTerms = null;
    return ok(schema.Settings, db.settings);
  }),

  paymentProfiles: http.get(`${API}/payment-profiles`, ({ request }) => {
    const all = query(request).get('includeArchived') === 'true';
    const paymentProfiles = getDb()
      .paymentProfiles.filter((p) => all || !p.archivedAt)
      .sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault) || byName(a, b),
      );
    return ok(envelopes.paymentProfiles, { paymentProfiles });
  }),

  /* The route's: the first live profile is the default whatever was asked,
     and one default holds, as the partial unique index enforces. */
  createPaymentProfile: http.post(
    `${API}/payment-profiles`,
    async ({ request }) => {
      const db = getDb();
      const input = await body<
        Partial<PaymentProfile> & Pick<PaymentProfile, 'name'>
      >(request);
      const isDefault =
        !!input.isDefault || !db.paymentProfiles.some((p) => !p.archivedAt);
      if (isDefault) for (const p of db.paymentProfiles) p.isDefault = false;
      const profile: PaymentProfile = {
        ...EMPTY_PROFILE,
        ...input,
        id: input.id ?? uuidv7(db.now.getTime()),
        isDefault,
        archivedAt: null,
      };
      db.paymentProfiles.push(profile);
      return ok(schema.PaymentProfile, profile, 201);
    },
  ),

  updatePaymentProfile: http.patch(
    `${API}/payment-profiles/:id`,
    async ({ params, request }) => {
      const db = getDb();
      const i = db.paymentProfiles.findIndex((p) => p.id === params.id);
      const profile = db.paymentProfiles[i];
      if (!profile) return missing('Payment profile');
      const input = await body<Partial<PaymentProfile>>(request);
      if (input.isDefault)
        for (const p of db.paymentProfiles) p.isDefault = false;
      // The only live profile stays the default.
      const others = db.paymentProfiles.some(
        (p) => p !== profile && !p.archivedAt,
      );
      if (input.isDefault === false && !others) delete input.isDefault;
      db.paymentProfiles[i] = { ...profile, ...input };
      return ok(schema.PaymentProfile, db.paymentProfiles[i]);
    },
  ),

  /* The default passes to the first live profile by name, so invoices keep
     their bank details. */
  archivePaymentProfile: http.delete(
    `${API}/payment-profiles/:id`,
    ({ params }) => {
      const db = getDb();
      const profile = byId(db.paymentProfiles, params.id);
      if (!profile) return missing('Payment profile');
      const wasDefault = profile.isDefault;
      Object.assign(profile, {
        archivedAt: db.now.toISOString(),
        isDefault: false,
      });
      const heir = db.paymentProfiles
        .filter((p) => !p.archivedAt)
        .sort(byName)[0];
      if (wasDefault && heir) heir.isDefault = true;
      return noContent();
    },
  ),

  account: http.get(`${API}/account`, () => {
    const db = getDb();
    return ok(schema.Account, {
      entries: db.entries.length,
      clients: db.clients.length,
      projects: db.projects.length,
      invoices: db.invoices.length,
    });
  }),

  deleteAccount: http.delete(`${API}/account`, () => noContent()),

  billing: http.get(`${API}/billing`, () =>
    ok(schema.Billing, getDb().billing),
  ),

  /* Stripe's pages are not faked: a story that presses through would leave
     Storybook, so the URL is one the story can see but never reach. */
  checkout: http.post(`${API}/billing/checkout`, () =>
    getDb().billing.plan === 'paid'
      ? fail('ALREADY_SUBSCRIBED')
      : ok(schema.BillingRedirect, { url: 'https://checkout.stripe.test/' }),
  ),

  billingPortal: http.post(`${API}/billing/portal`, () =>
    getDb().billing.status === null
      ? fail('NOT_SUBSCRIBED')
      : ok(schema.BillingRedirect, { url: 'https://billing.stripe.test/' }),
  ),

  /* Back from Checkout: Stripe says the year is paid. */
  syncCheckout: http.post(`${API}/billing/sync`, () => {
    const db = getDb();
    const end = new Date(db.now);
    end.setFullYear(end.getFullYear() + 1);
    db.billing = {
      ...db.billing,
      plan: 'paid',
      status: 'active',
      periodEnd: end.toISOString(),
    };
    return ok(schema.Billing, db.billing);
  }),

  importPreview: http.post(`${API}/imports/preview`, async ({ request }) => {
    const preview = await importPreview(request);
    return preview instanceof Response ? preview : Response.json(preview);
  }),

  /* `imports/confirm/route.ts`: writes what the preview showed and reports
     it. */
  importConfirm: http.post(`${API}/imports/confirm`, async ({ request }) => {
    const preview = await importPreview(request);
    if (preview instanceof Response) return preview;
    const db = getDb();
    for (const c of preview.clients.filter((c) => c.isNew))
      db.clients.push({
        id: c.id,
        name: c.name,
        email: null,
        address: null,
        hourlyRate: c.hourlyRate,
        taxRate: null,
        currency: null,
        color: c.color,
        paymentProfileId: null,
        billingSchedule: null,
        paymentTermsDays: null,
        archivedAt: null,
      });
    for (const p of preview.newProjects)
      db.projects.push({
        ...p,
        hourlyRate: null,
        isBillableDefault: true,
        archivedAt: null,
      });
    const rows = preview.rows.filter((r) => r.willWrite);
    let written = 0;
    for (const r of rows) {
      if (byId(db.entries, r.id)) continue;
      db.entries.push(
        withDuration({
          id: r.id,
          projectId: r.projectId,
          taskName: r.taskName,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          isBillable: r.billable,
          rateOverride: null,
          invoiceId: null,
          durationSeconds: null,
          durationOk: false,
          invoicedElsewhere: r.invoicedElsewhere,
        }),
      );
      written += 1;
    }
    return Response.json({
      source: preview.source,
      written,
      alreadyImported: rows.length - written,
      unrated: preview.summary.unratedCount,
      overlapping: preview.summary.overlappingCount,
      excluded: preview.summary.excludedCount,
      invoicedElsewhere: preview.summary.invoicedElsewhereCount,
    } satisfies ImportResult);
  }),
};
