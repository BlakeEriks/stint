import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ExpenseList } from '@/components/expense-list';

const client = (id: string, name: string) => ({
  id,
  name,
  email: null,
  address: null,
  hourlyRate: 150,
  taxRate: null,
  currency: 'USD',
  color: null,
  paymentProfileId: null,
  archivedAt: null,
});
const CLIENTS = [client('c1', 'Acme Corp'), client('c2', 'Northwind')];

const expense = (over: Record<string, unknown>) => ({
  id: 'x1',
  clientId: 'c1',
  projectId: null,
  spentOn: '2026-09-12',
  description: 'JetBrains license',
  amount: 199,
  note: null,
  invoiceId: null,
  invoiceNumber: null,
  invoiceStatus: null,
  ...over,
});

/** Serves the list and records every request. */
function serve(expenses = [expense({})]) {
  const calls: Array<{ method: string; path: string; body: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace('/api/v1', '');
      const method = init?.method ?? 'GET';
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (method === 'DELETE') return new Response(null, { status: 204 });
      if (method !== 'GET') {
        return new Response(JSON.stringify(expense({})), { status: 201 });
      }
      if (path.startsWith('/expenses')) {
        return new Response(JSON.stringify({ expenses }), { status: 200 });
      }
      if (path.startsWith('/clients')) {
        return new Response(JSON.stringify({ clients: CLIENTS }), {
          status: 200,
        });
      }
      if (path.startsWith('/projects')) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }),
  );
  return calls;
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('ExpenseList', () => {
  it('lists waiting expenses with date, client and amount', async () => {
    const calls = serve();
    render(<ExpenseList />, { wrapper });

    expect(await screen.findByText('JetBrains license')).toBeInTheDocument();
    expect(screen.getByText('Sep 12, 2026')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('$199.00')).toBeInTheDocument();
    expect(calls[0]?.path).toContain('status=unbilled');
  });

  it('narrows to one client', async () => {
    const calls = serve();
    const user = userEvent.setup();
    render(<ExpenseList />, { wrapper });
    await screen.findByText('JetBrains license');

    await user.click(screen.getByRole('button', { name: 'Filter by client' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Northwind' }),
    );

    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path.startsWith('/expenses') && c.path.includes('clientId=c2'),
        ),
      ).toBe(true),
    );
  });

  it('records an expense only once it has a client, date, description and amount', async () => {
    const calls = serve([]);
    const user = userEvent.setup();
    render(<ExpenseList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Add expense' }),
    );
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Add expense' });
    expect(submit).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Client' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Acme Corp' }),
    );
    await user.type(within(dialog).getByLabelText(/Description/), 'Flight');
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Amount/), '0');
    expect(submit).toBeDisabled();
    await user.clear(within(dialog).getByLabelText(/Amount/));
    await user.type(within(dialog).getByLabelText(/Amount/), '412.5');
    await user.click(submit);

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST');
      expect(post?.path).toBe('/expenses');
      expect(post?.body).toMatchObject({
        clientId: 'c1',
        description: 'Flight',
        amount: 412.5,
      });
      expect(post?.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('edits and deletes an unbilled expense', async () => {
    const calls = serve();
    const user = userEvent.setup();
    render(<ExpenseList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Edit JetBrains license' }),
    );
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '249');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === 'PATCH' && c.path === '/expenses/x1')
          ?.body.amount,
      ).toBe(249),
    );

    await user.click(
      screen.getByRole('button', { name: 'Delete JetBrains license' }),
    );
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'DELETE' && c.path === '/expenses/x1'),
      ).toBe(true),
    );
  });

  it('shows where a billed expense went, and locks it once issued', async () => {
    serve([
      expense({
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-0014',
        invoiceStatus: 'sent',
      }),
      expense({
        id: 'x2',
        description: 'Draft flight',
        invoiceId: 'inv-2',
        invoiceNumber: 'INV-0015',
        invoiceStatus: 'draft',
      }),
    ]);
    render(<ExpenseList />, { wrapper });

    expect(await screen.findByText(/INV-0014/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit JetBrains license' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete JetBrains license' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit Draft flight' }),
    ).toBeEnabled();
  });
});
