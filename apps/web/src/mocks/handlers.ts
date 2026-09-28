import {
  buildPreview,
  formatInvoiceNumber,
  parseExport,
  uuidv7,
} from '@stint/core';
import { http } from 'msw';
import type {
  Client,
  PaymentProfile,
  Project,
  Settings,
  TimeEntry,
} from '@/lib/client/api';
import { getDb } from './db';
import {
  calendar,
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
  noContent,
  ok,
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

function stopEntry(entry: TimeEntry, now: Date): TimeEntry {
  const seconds = Math.floor(
    (now.getTime() - Date.parse(entry.startedAt)) / 1000,
  );
  return { ...entry, endedAt: now.toISOString(), durationSeconds: seconds };
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

async function importPreview(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return undefined;
  const parsed = parseExport(await file.text());
  if (!parsed.ok) return parsed.reason;
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
      granularity: q.get('granularity'),
    });
    return q.get('granularity') === 'day'
      ? ok(envelopes.activity, { days } as never)
      : ok(envelopes.calendar, { days } as never);
  }),

  startTimer: http.post(`${API}/timer/start`, async ({ request }) => {
    const db = getDb();
    const running = db.entries.find((e) => e.endedAt === null);
    if (running)
      return fail(409, 'TIMER_ALREADY_RUNNING', 'A timer is already running');
    const input = await body<{ taskName: string; projectId?: string | null }>(
      request,
    );
    const project = byId(db.projects, input.projectId);
    const entry: TimeEntry = {
      id: uuidv7(db.now.getTime()),
      projectId: input.projectId ?? null,
      taskName: input.taskName,
      startedAt: db.now.toISOString(),
      endedAt: null,
      isBillable: project?.isBillableDefault ?? true,
      rateOverride: null,
      invoiceId: null,
      durationSeconds: null,
      durationOk: false,
    };
    db.entries.push(entry);
    return ok(schema.TimeEntry, entry);
  }),

  stopTimer: http.post(`${API}/timer/stop`, () => {
    const db = getDb();
    const i = db.entries.findIndex((e) => e.endedAt === null);
    const running = db.entries[i];
    if (!running) return fail(404, 'NO_RUNNING_TIMER', 'No timer is running');
    const stopped = stopEntry(running, db.now);
    db.entries[i] = stopped;
    return ok(schema.StoppedTimer, {
      ...stopped,
      currency: db.settings.currency,
      unbilled: unbilledSummary(db),
    });
  }),

  updateRunning: http.patch(`${API}/timer/current`, async ({ request }) => {
    const db = getDb();
    const i = db.entries.findIndex((e) => e.endedAt === null);
    const running = db.entries[i];
    if (!running) return fail(404, 'NO_RUNNING_TIMER', 'No timer is running');
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
    const entries = getDb()
      .entries.filter(
        (e) =>
          (!from || e.startedAt >= new Date(from).toISOString()) &&
          (!to || e.startedAt <= new Date(to).toISOString()) &&
          (!projectId ||
            e.projectId === (projectId === 'none' ? null : projectId)),
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return ok(envelopes.entries, { entries });
  }),

  entry: http.get(`${API}/entries/:id`, ({ params }) => {
    const entry = byId(getDb().entries, params.id);
    return entry ? ok(schema.TimeEntry, entry) : fail(404, 'NOT_FOUND');
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
      isBillable: true,
      ...input,
      rateOverride: null,
      invoiceId: null,
      durationSeconds: null,
      durationOk: false,
    });
    db.entries.push(entry);
    return ok(schema.TimeEntry, entry);
  }),

  updateEntry: http.patch(`${API}/entries/:id`, async ({ params, request }) => {
    const db = getDb();
    const i = db.entries.findIndex((e) => e.id === params.id);
    const entry = db.entries[i];
    if (!entry) return fail(404, 'NOT_FOUND');
    const invoice = byId(db.invoices, entry.invoiceId);
    if (invoice && invoice.status !== 'draft')
      return fail(409, 'ENTRY_BILLED', 'This entry is on an issued invoice');
    db.entries[i] = withDuration({
      ...entry,
      ...(await body<Partial<TimeEntry>>(request)),
    });
    return ok(schema.TimeEntry, db.entries[i]);
  }),

  deleteEntry: http.delete(`${API}/entries/:id`, ({ params }) => {
    const db = getDb();
    db.entries = db.entries.filter((e) => e.id !== params.id);
    return noContent();
  }),

  projects: http.get(`${API}/projects`, ({ request }) => {
    const q = query(request);
    const clientId = q.get('clientId');
    const projects = getDb()
      .projects.filter(
        (p) =>
          (q.get('includeArchived') === 'true' || p.archivedAt === null) &&
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
      if (!project) return fail(404, 'NOT_FOUND');
      db.projects[i] = {
        ...project,
        ...(await body<Partial<Project>>(request)),
      };
      return ok(schema.Project, db.projects[i]);
    },
  ),

  archiveProject: http.delete(`${API}/projects/:id`, ({ params }) => {
    const db = getDb();
    const project = byId(db.projects, params.id);
    if (!project) return fail(404, 'NOT_FOUND');
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

  client: http.get(`${API}/clients/:id`, ({ params }) => {
    const client = byId(getDb().clients, params.id);
    return client ? ok(schema.Client, client) : fail(404, 'NOT_FOUND');
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
      if (!client) return fail(404, 'NOT_FOUND');
      db.clients[i] = { ...client, ...(await body<Partial<Client>>(request)) };
      return ok(schema.Client, db.clients[i]);
    },
  ),

  archiveClient: http.delete(`${API}/clients/:id`, ({ params }) => {
    const db = getDb();
    const client = byId(db.clients, params.id);
    if (!client) return fail(404, 'NOT_FOUND');
    client.archivedAt = db.now.toISOString();
    return noContent();
  }),

  invoices: http.get(`${API}/invoices`, () => {
    const invoices = getDb()
      .invoices.map(({ lineItems: _, ...invoice }) => invoice)
      .sort((a, b) => b.sequenceNo - a.sequenceNo);
    return ok(envelopes.invoices, { invoices });
  }),

  invoice: http.get(`${API}/invoices/:id`, ({ params }) => {
    const db = getDb();
    const invoice = byId(db.invoices, params.id);
    const client = byId(db.clients, invoice?.clientId);
    if (!invoice || !client) return fail(404, 'NOT_FOUND');
    const { id, name, email, address } = client;
    return ok(invoiceDetail, {
      ...invoice,
      client: { id, name, email, address },
    });
  }),

  previewInvoice: http.post(`${API}/invoices/preview`, async ({ request }) => {
    const input = await body<PreviewRequest>(request);
    const preview = invoicePreview(getDb(), input, input.tz ?? ZONE);
    return preview
      ? ok(schema.InvoicePreview, preview)
      : fail(404, 'NOT_FOUND');
  }),

  createInvoice: http.post(`${API}/invoices`, async ({ request }) => {
    const db = getDb();
    const input = await body<
      PreviewRequest & { issueDate?: string; dueDate?: string; notes?: string }
    >(request);
    const preview = invoicePreview(db, input, input.tz ?? ZONE);
    if (!preview) return fail(404, 'NOT_FOUND');
    if (preview.unratedEntryIds.length > 0)
      return fail(422, 'UNRATED_ENTRIES', 'Some entries have no rate');
    const seq = db.settings.nextInvoiceNumber;
    db.settings.nextInvoiceNumber += 1;
    const invoice = {
      id: uuidv7(db.now.getTime()),
      clientId: preview.clientId,
      invoiceNumber: formatInvoiceNumber(db.settings.invoiceNumberPrefix, seq),
      sequenceNo: seq,
      status: 'draft' as const,
      issueDate: input.issueDate ?? db.now.toISOString().slice(0, 10),
      dueDate: input.dueDate ?? null,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
      subtotal: preview.subtotal,
      taxRate: preview.taxRate,
      taxAmount: preview.taxAmount,
      total: preview.total,
      currency: preview.currency,
      notes: input.notes ?? null,
      paymentTerms: db.settings.defaultPaymentTerms,
      groupingMode: preview.groupingMode,
      paymentDetails: null,
      sentAt: null,
      paidAt: null,
      createdAt: db.now.toISOString(),
    };
    const claimed = new Set(preview.lineItems.flatMap((l) => l.entryIds));
    for (const e of db.entries) if (claimed.has(e.id)) e.invoiceId = invoice.id;
    db.invoices.push({
      ...invoice,
      lineItems: preview.lineItems.map(
        ({ rateSource: _, entryIds: __, ...l }, i) => ({
          ...l,
          id: uuidv7(db.now.getTime()),
          sortOrder: i,
        }),
      ),
    });
    return ok(createdInvoice, {
      ...invoice,
      lineItems: preview.lineItems,
      entryCount: preview.entryCount,
    });
  }),

  updateInvoiceStatus: http.patch(
    `${API}/invoices/:id/status`,
    async ({ params, request }) => {
      const db = getDb();
      const invoice = byId(db.invoices, params.id);
      if (!invoice) return fail(404, 'NOT_FOUND');
      const input = await body<{
        status: typeof invoice.status;
        sentAt?: string;
        paidAt?: string;
      }>(request);
      invoice.status = input.status;
      if (input.status === 'sent')
        invoice.sentAt = input.sentAt ?? db.now.toISOString();
      if (input.status === 'paid')
        invoice.paidAt = input.paidAt ?? db.now.toISOString();
      if (input.status === 'void')
        for (const e of db.entries)
          if (e.invoiceId === invoice.id) e.invoiceId = null;
      const { lineItems: _, ...rest } = invoice;
      return ok(schema.Invoice, rest);
    },
  ),

  deleteInvoice: http.delete(`${API}/invoices/:id`, ({ params }) => {
    const db = getDb();
    const invoice = byId(db.invoices, params.id);
    if (!invoice) return fail(404, 'NOT_FOUND');
    if (invoice.status !== 'draft')
      return fail(409, 'INVOICE_ISSUED', 'An issued invoice is voided');
    for (const e of db.entries)
      if (e.invoiceId === invoice.id) e.invoiceId = null;
    db.invoices = db.invoices.filter((i) => i !== invoice);
    return noContent();
  }),

  settings: http.get(`${API}/settings`, () =>
    ok(schema.Settings, getDb().settings),
  ),

  updateSettings: http.patch(`${API}/settings`, async ({ request }) => {
    const db = getDb();
    const { nextInvoiceNumber: _, ...input } =
      await body<Partial<Settings>>(request);
    db.settings = { ...db.settings, ...input };
    return ok(schema.Settings, db.settings);
  }),

  paymentProfiles: http.get(`${API}/payment-profiles`, () => {
    const paymentProfiles = [...getDb().paymentProfiles].sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || byName(a, b),
    );
    return ok(envelopes.paymentProfiles, { paymentProfiles });
  }),

  createPaymentProfile: http.post(
    `${API}/payment-profiles`,
    async ({ request }) => {
      const db = getDb();
      const profile = {
        ...(await body<Omit<PaymentProfile, 'id' | 'isDefault'>>(request)),
        id: uuidv7(db.now.getTime()),
        isDefault: db.paymentProfiles.length === 0,
        archivedAt: null,
      };
      db.paymentProfiles.push(profile);
      return ok(schema.PaymentProfile, profile);
    },
  ),

  updatePaymentProfile: http.patch(
    `${API}/payment-profiles/:id`,
    async ({ params, request }) => {
      const db = getDb();
      const i = db.paymentProfiles.findIndex((p) => p.id === params.id);
      const profile = db.paymentProfiles[i];
      if (!profile) return fail(404, 'NOT_FOUND');
      const input = await body<Partial<PaymentProfile>>(request);
      // One default, as the partial unique index enforces.
      if (input.isDefault)
        for (const p of db.paymentProfiles) p.isDefault = false;
      db.paymentProfiles[i] = { ...profile, ...input };
      return ok(schema.PaymentProfile, db.paymentProfiles[i]);
    },
  ),

  archivePaymentProfile: http.delete(
    `${API}/payment-profiles/:id`,
    ({ params }) => {
      const db = getDb();
      const profile = byId(db.paymentProfiles, params.id);
      if (!profile) return fail(404, 'NOT_FOUND');
      profile.archivedAt = db.now.toISOString();
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

  importPreview: http.post(`${API}/imports/preview`, async ({ request }) => {
    const preview = await importPreview(request);
    if (typeof preview === 'string')
      return fail(422, 'IMPORT_FILE_UNRECOGNIZED', preview);
    return preview
      ? Response.json(preview)
      : fail(400, 'VALIDATION_FAILED', 'Send exactly one file as "file"');
  }),

  importConfirm: http.post(`${API}/imports/confirm`, async ({ request }) => {
    const preview = await importPreview(request);
    if (!preview || typeof preview === 'string')
      return fail(422, 'IMPORT_FILE_UNRECOGNIZED', String(preview));
    const { summary: s } = preview;
    return Response.json({
      source: preview.source,
      written: s.willWriteCount,
      alreadyImported: s.alreadyImportedCount,
      unrated: s.unratedCount,
      overlapping: s.overlappingCount,
      excluded: s.excludedCount,
      invoicedElsewhere: s.invoicedElsewhereCount,
    });
  }),
};
