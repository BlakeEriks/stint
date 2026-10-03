import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ClientDialog } from '@/components/client-dialog';
import type { Client } from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const NORTHWIND = {
  id: 'c1',
  name: 'Northwind Trading',
  email: 'ap@northwind.test',
  address: null,
  hourlyRate: 150,
  taxRate: 0,
  color: '#6EA1E2',
  archivedAt: null,
} as unknown as Client;

function serve() {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = String(url).replace('/api/v1', '');
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (method !== 'GET') calls.push({ method, path, body });
      return new Response(JSON.stringify({ ...NORTHWIND, ...(body ?? {}) }), {
        status: 200,
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('ClientDialog', () => {
  it('edits the client with the same form the page uses, and closes', async () => {
    const calls = serve();
    const closed = vi.fn();
    const user = userEvent.setup();
    render(<ClientDialog open onOpenChange={closed} client={NORTHWIND} />, {
      wrapper,
    });

    expect(
      await screen.findByRole('heading', { name: 'Edit client' }),
    ).toBeInTheDocument();
    const name = screen.getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, 'Northwind Co');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(closed).toHaveBeenCalledWith(false));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/clients/c1',
      body: { name: 'Northwind Co' },
    });
  });

  it('archives the client and closes', async () => {
    const calls = serve();
    const closed = vi.fn();
    const user = userEvent.setup();
    render(<ClientDialog open onOpenChange={closed} client={NORTHWIND} />, {
      wrapper,
    });

    await user.click(await screen.findByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(closed).toHaveBeenCalledWith(false));
    expect(calls).toContainEqual({
      method: 'DELETE',
      path: '/clients/c1',
      body: undefined,
    });
  });

  it('archiving the client refreshes the projects the pickers offer', async () => {
    serve();
    const qc = new QueryClient();
    qc.setQueryData(keys.projects(), { projects: [] });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={qc}>
        <ClientDialog open onOpenChange={() => {}} client={NORTHWIND} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Archive' }));

    /* Its projects now count as archived, so a picker holding them would
       still offer time against a finished engagement. */
    await waitFor(() =>
      expect(qc.getQueryState(keys.projects())?.isInvalidated).toBe(true),
    );
  });

  it('offers no archive for a client already archived', async () => {
    serve();
    render(
      <ClientDialog
        open
        onOpenChange={() => {}}
        client={{ ...NORTHWIND, archivedAt: '2026-01-04T00:00:00Z' }}
      />,
      { wrapper },
    );
    await screen.findByLabelText(/^Name/);
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });
});
