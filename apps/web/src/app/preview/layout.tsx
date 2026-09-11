'use client';

import { useEffect, useState } from 'react';

/**
 * TEMPORARY — a signed-out shell for looking at the client screens while
 * there is no live Supabase project. It intercepts `fetch` for `/api/v1/*`
 * and serves an in-memory store, so the REAL components and the REAL
 * TanStack Query wiring run; only the network is stubbed.
 *
 * Delete this directory once auth works against a live project.
 */
const EMPTY_PROFILE = {
  isDefault: false, accountHolderName: null, accountHolderAddress: null,
  bankName: null, bankAddress: null, accountNumber: null, routingNumber: null,
  accountType: null, iban: null, swiftBic: null, localCodeLabel: null,
  localCode: null, intermediaryBankName: null, intermediarySwiftBic: null,
  intermediaryAccountNumber: null, paymentLinkLabel: null, paymentLinkUrl: null,
  currency: 'USD', feeAllocation: null, notes: null, archivedAt: null,
};

const seed = () => [
  {
    id: '0192f0a0-0000-7000-8000-000000000001',
    name: 'Acme Corp',
    email: 'billing@acme.com',
    address: '123 Main St\nAustin, TX 78701',
    hourlyRate: 150,
    taxRate: null,
    currency: 'USD',
    color: '#DA8188',
    paymentProfileId: null,
    archivedAt: null,
  },
  {
    id: '0192f0a0-0000-7000-8000-000000000002',
    name: 'Bluebird Labs',
    email: 'ap@bluebird.io',
    address: null,
    hourlyRate: 185,
    taxRate: null,
    currency: 'USD',
    color: '#42B59A',
    paymentProfileId: null,
    archivedAt: null,
  },
  {
    id: '0192f0a0-0000-7000-8000-000000000003',
    name: 'Corvus (old)',
    email: null,
    address: null,
    hourlyRate: null,
    taxRate: null,
    currency: 'USD',
    color: null,
    paymentProfileId: null,
    archivedAt: '2026-06-01T00:00:00.000Z',
  },
];

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store: Record<string, any>[] = seed();
    const projects: Record<string, any>[] = [
      { id: 'pv-1', clientId: null, name: 'Acme Redesign', hourlyRate: null,
        color: '#DA8188', isBillableDefault: true, archivedAt: null },
      { id: 'pv-2', clientId: null, name: 'Bluebird API', hourlyRate: null,
        color: '#42B59A', isBillableDefault: true, archivedAt: null },
    ];
    const profiles: Record<string, any>[] = [
      {
        id: 'pp-1',
        name: 'Chase business',
        isDefault: true,
        accountHolderName: 'Blake Eriks LLC',
        accountHolderAddress: null,
        bankName: 'Chase',
        bankAddress: null,
        accountNumber: '000123456789',
        routingNumber: '021000021',
        accountType: 'checking',
        iban: null, swiftBic: null, localCodeLabel: null, localCode: null,
        intermediaryBankName: null, intermediarySwiftBic: null,
        intermediaryAccountNumber: null,
        paymentLinkLabel: null, paymentLinkUrl: null,
        currency: 'USD', feeAllocation: null, notes: null, archivedAt: null,
      },
    ];
    // Seeded so the detail route has something to show: a full page
    // navigation resets this store, so a just-created invoice would vanish.
    const invoices: Record<string, any>[] = [
      {
        id: 'inv-seed-1',
        clientId: '0192f0a0-0000-7000-8000-000000000001',
        invoiceNumber: 'INV-13',
        sequenceNo: 13,
        status: 'draft',
        issueDate: '2026-09-01',
        dueDate: '2026-10-01',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        subtotal: 1425, taxRate: 0, taxAmount: 0, total: 1425,
        currency: 'USD', notes: null, paymentTerms: 'Net 30',
        groupingMode: 'entry', paymentDetails: null,
        sentAt: null, paidAt: null, createdAt: '2026-09-01T00:00:00.000Z',
        _client: { id: '0192f0a0-0000-7000-8000-000000000001', name: 'Acme Corp', hourlyRate: 150 },
      },
    ];
    let settings: Record<string, any> = {
      defaultHourlyRate: 150,
      currency: 'USD',
      weekStartsOn: 1,
      timeFormat: '24h',
      maxTimerHours: 8,
      businessName: 'Blake Eriks LLC',
      businessAddress: '123 Main St\nAustin, TX 78701',
      businessEmail: 'hi@example.com',
      logoUrl: null,
      taxId: '12-3456789',
      defaultPaymentTerms: 'Net 30',
      invoiceNumberPrefix: 'INV-',
      nextInvoiceNumber: 14,
      paymentNotice: null,
    };
    const real = window.fetch.bind(window);

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : input.toString());
      if (!url.includes('/api/v1/')) return real(input as any, init);

      const path = (url.split('/api/v1')[1] ?? '').split('?')[0] ?? '';
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const archived = url.includes('includeArchived=true');

      if (path === '/clients' && method === 'GET') {
        return json({
          clients: store.filter((c) => archived || !c.archivedAt),
        });
      }
      if (path === '/clients' && method === 'POST') {
        const created = {
          ...body,
          id: crypto.randomUUID(),
          currency: 'USD',
          paymentProfileId: null,
          archivedAt: null,
        };
        store.push(created);
        return json(created);
      }

      const match = path.match(/^\/clients\/([^/]+)$/);
      if (match) {
        const wanted = match[1];
        const i = store.findIndex((c) => c.id === wanted);
        if (i === -1) return json({ code: 'NOT_FOUND', message: 'No such client' }, 404);
        if (method === 'GET') return json(store[i]);
        if (method === 'PATCH') {
          store[i] = { ...store[i], ...body };
          return json(store[i]);
        }
        if (method === 'DELETE') {
          store[i] = { ...store[i], archivedAt: new Date().toISOString() };
          return new Response(null, { status: 204 });
        }
      }

      if (path === '/projects' && method === 'GET') {
        return json({ projects });
      }
      if (path === '/projects' && method === 'POST') {
        const created = { ...body, id: crypto.randomUUID(), archivedAt: null };
        projects.push(created);
        return json(created);
      }
      if (path === '/summary') {
        const running = new URLSearchParams(location.search).get('running')
          ? {
              id: 'run-1',
              taskName: 'Invoice templates',
              projectId: null,
              startedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
              endedAt: null,
              isBillable: true,
              durationSeconds: null,
            }
          : null;
        return json({
          running,
          todaySeconds: running ? 1500 : 0,
          weekSeconds: 0,
          exceedsThreshold: false,
          maxTimerHours: 8,
          serverTime: new Date().toISOString(),
        });
      }
      if (path === '/entries') return json({ entries: [] });

      if (path === '/invoices/preview' && method === 'POST') {
        const client = store.find((c) => c.id === body.clientId);
        const rate = client?.hourlyRate ?? 150;
        const lines = [
          { description: 'Design review', quantitySeconds: 9000, quantityHours: 2.5 },
          { description: 'Component library', quantitySeconds: 10800, quantityHours: 3 },
          { description: 'API routes', quantitySeconds: 14400, quantityHours: 4 },
        ].map((l) => ({
          ...l, resolvedRate: rate, rateSource: 'client',
          amount: Math.round(l.quantityHours * rate * 100) / 100,
        }));
        const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
        return json({
          clientId: body.clientId, clientName: client?.name ?? 'Unknown',
          periodStart: body.periodStart, periodEnd: body.periodEnd,
          groupingMode: body.groupingMode ?? 'entry',
          currency: 'USD', lineItems: lines,
          subtotal, taxRate: 0, taxAmount: 0, total: subtotal,
          entryCount: 7, unratedEntryIds: [],
        });
      }
      if (path === '/invoices' && method === 'POST') {
        const client = store.find((c) => c.id === body.clientId);
        const created = {
          id: crypto.randomUUID(),
          clientId: body.clientId,
          invoiceNumber: `INV-${settings.nextInvoiceNumber}`,
          sequenceNo: settings.nextInvoiceNumber,
          status: 'draft',
          issueDate: new Date().toLocaleDateString('en-CA'),
          dueDate: body.dueDate ?? null,
          periodStart: body.periodStart, periodEnd: body.periodEnd,
          subtotal: 1425, taxRate: 0, taxAmount: 0, total: 1425,
          currency: 'USD', notes: body.notes ?? null,
          paymentTerms: 'Net 30', groupingMode: body.groupingMode ?? 'entry',
          paymentDetails: null, sentAt: null, paidAt: null,
          createdAt: new Date().toISOString(),
          _client: client,
        };
        settings.nextInvoiceNumber += 1;
        invoices.unshift(created);
        return json(created);
      }
      if (path === '/invoices' && method === 'GET') {
        return json({ invoices });
      }
      const inv = path.match(/^\/invoices\/([^/]+)$/);
      if (inv) {
        const wanted = inv[1];
        const i = invoices.findIndex((x) => x.id === wanted);
        if (i === -1) return json({ code: 'NOT_FOUND', message: 'no' }, 404);
        if (method === 'GET') {
          const found = invoices[i]!;
          const rate = found._client?.hourlyRate ?? 150;
          return json({
            invoice: found,
            client: found._client ?? { id: '', name: 'Unknown' },
            lineItems: [
              { description: 'Design review', quantitySeconds: 9000, quantityHours: 2.5, resolvedRate: rate, rateSource: 'client', amount: 375 },
              { description: 'Component library', quantitySeconds: 10800, quantityHours: 3, resolvedRate: rate, rateSource: 'client', amount: 450 },
              { description: 'API routes', quantitySeconds: 14400, quantityHours: 4, resolvedRate: rate, rateSource: 'client', amount: 600 },
            ],
          });
        }
        if (method === 'DELETE') {
          invoices.splice(i, 1);
          return new Response(null, { status: 204 });
        }
      }
      const st = path.match(/^\/invoices\/([^/]+)\/status$/);
      if (st && method === 'PATCH') {
        const wanted = st[1];
        const i = invoices.findIndex((x) => x.id === wanted);
        if (i === -1) return json({ code: 'NOT_FOUND', message: 'no' }, 404);
        invoices[i] = { ...invoices[i], status: body.status };
        return json(invoices[i]);
      }

      if (path === '/calendar') {
        const u = new URL(url, location.origin);
        const from = new Date(u.searchParams.get('from') ?? Date.now());
        const mk = (
          dayOffset: number, startH: number, hours: number,
          taskName: string, projectId: string | null,
        ) => {
          const s = new Date(from);
          s.setDate(s.getDate() + dayOffset);
          s.setHours(startH, 0, 0, 0);
          const e = new Date(s.getTime() + hours * 3600_000);
          return {
            id: `c-${dayOffset}-${startH}`,
            taskName, projectId,
            startedAt: s.toISOString(),
            endedAt: e.toISOString(),
            isBillable: true,
            durationSeconds: Math.round(hours * 3600),
          };
        };
        const all = [
          mk(0, 9, 2.5, 'Design review', 'pv-1'),
          mk(0, 13, 3, 'Component library', 'pv-1'),
          mk(1, 10, 1.5, 'Client call', null),
          // Deliberately overlapping, to exercise the lane assignment.
          mk(1, 11, 2, 'Invoice templates', 'pv-2'),
          mk(2, 8.5 | 0, 4, 'API routes', 'pv-2'),
          mk(3, 14, 2.25, 'Bug triage', 'pv-1'),
          mk(4, 9, 6, 'Sprint work', 'pv-2'),
        ];
        const days = new Map();
        for (const e of all) {
          const k = new Date(e.startedAt).toLocaleDateString('en-CA');
          const d = days.get(k) ?? { date: k, totalSeconds: 0, entries: [] };
          d.entries.push(e);
          d.totalSeconds += e.durationSeconds;
          days.set(k, d);
        }
        return json({ days: [...days.values()] });
      }

      if (path === '/settings') {
        if (method === 'PATCH') settings = { ...settings, ...body };
        return json(settings);
      }
      if (path === '/payment-profiles') {
        if (method === 'POST') {
          const created = { ...EMPTY_PROFILE, ...body, id: crypto.randomUUID() };
          if (profiles.length === 0) created.isDefault = true;
          profiles.push(created);
          return json(created);
        }
        return json({ paymentProfiles: profiles });
      }
      const pp = path.match(/^\/payment-profiles\/([^/]+)$/);
      if (pp) {
        const wanted = pp[1];
        const i = profiles.findIndex((p) => p.id === wanted);
        if (i === -1) return json({ code: 'NOT_FOUND', message: 'no' }, 404);
        if (method === 'PATCH') {
          if (body?.isDefault) profiles.forEach((p) => (p.isDefault = false));
          profiles[i] = { ...profiles[i], ...body };
          return json(profiles[i]);
        }
      }

      return json({ code: 'NOT_FOUND', message: path }, 404);
    }) as typeof window.fetch;

    setReady(true);
    return () => {
      window.fetch = real;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
