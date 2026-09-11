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
    const projects: Record<string, any>[] = [];
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
