import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ClientProjects } from '@/components/client-projects';
import type { Client, Project } from '@/lib/client/api';

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
  name: 'Northwind',
  hourlyRate: 150,
  color: null,
} as unknown as Client;

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    clientId: 'c1',
    name: 'Website redesign',
    hourlyRate: null,
    isBillableDefault: true,
    archivedAt: null,
    ...over,
  } as Project;
}

function serve(projects: Project[], defaultHourlyRate: number | null = 125) {
  const calls: Array<{ method: string; path: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = String(url).replace('/api/v1', '');
      if (method !== 'GET') {
        calls.push({ method, path });
        return new Response('{}', { status: 200 });
      }
      if (path.startsWith('/projects')) {
        return new Response(JSON.stringify({ projects }), { status: 200 });
      }
      if (path.startsWith('/settings')) {
        return new Response(JSON.stringify({ defaultHourlyRate }), {
          status: 200,
        });
      }
      if (path.startsWith('/clients')) {
        return new Response(JSON.stringify({ clients: [NORTHWIND] }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('ClientProjects', () => {
  it('asks only for this client’s projects', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = String(url).replace('/api/v1', '');
        seen.push(path);
        if (path.startsWith('/projects')) {
          return new Response(JSON.stringify({ projects: [] }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ defaultHourlyRate: 125 }), {
          status: 200,
        });
      }),
    );
    render(<ClientProjects client={NORTHWIND} />, { wrapper });

    /* Filtering server-side, not in the component: a contractor's whole
       project list is not something to download to render one client. */
    await waitFor(() =>
      expect(seen.some((p) => p.includes('clientId=c1'))).toBe(true),
    );
  });

  it('shows the inherited rate, not the empty column', async () => {
    serve([project({ hourlyRate: null })]);
    render(<ClientProjects client={NORTHWIND} />, { wrapper });

    /* The common case: a project stores no rate of its own. Printing the
       column would show nothing, which says the opposite of the truth — the
       project DOES bill, just at a rate it inherits. */
    await waitFor(() =>
      expect(screen.getByText('$150.00/h')).toBeInTheDocument(),
    );
    expect(screen.getByText('from Northwind')).toBeInTheDocument();
  });

  it('names what an override overrides, not merely that it overrides', async () => {
    serve([project({ hourlyRate: 195 })]);
    render(<ClientProjects client={NORTHWIND} />, { wrapper });

    // The comparison is the reason to look at all.
    await waitFor(() =>
      expect(screen.getByText('$195.00/h')).toBeInTheDocument(),
    );
    expect(
      screen.getByText("overrides Northwind's $150.00"),
    ).toBeInTheDocument();
  });

  it('falls through to the user default when neither level sets one', async () => {
    serve([project()], 125);
    render(
      <ClientProjects client={{ ...NORTHWIND, hourlyRate: null } as Client} />,
      { wrapper },
    );

    await waitFor(() =>
      expect(screen.getByText('$125.00/h')).toBeInTheDocument(),
    );
    expect(screen.getByText('your default rate')).toBeInTheDocument();
  });

  it('warns when no rate resolves anywhere, because invoicing will refuse', async () => {
    serve([project()], null);
    render(
      <ClientProjects client={{ ...NORTHWIND, hourlyRate: null } as Client} />,
      { wrapper },
    );

    /* Not cosmetic: /invoices refuses to generate from unrated entries, so
       without this the failure is discovered at the moment of billing. */
    await waitFor(() =>
      expect(
        screen.getByText(/No rate — invoicing will refuse/),
      ).toBeInTheDocument(),
    );
  });

  it('says a non-billable project is non-billable rather than showing a rate', async () => {
    serve([project({ isBillableDefault: false, hourlyRate: 195 })]);
    render(<ClientProjects client={NORTHWIND} />, { wrapper });

    /* A stored rate on non-billable work is real but irrelevant: showing
       "$195.00/h" would imply this bills, which it does not. */
    await waitFor(() =>
      expect(screen.getByText('Non-billable by default')).toBeInTheDocument(),
    );
    expect(screen.queryByText('$195.00/h')).toBeNull();
  });

  it('archives rather than deletes, and names the project it acts on', async () => {
    const calls = serve([project()]);
    const user = userEvent.setup();
    render(<ClientProjects client={NORTHWIND} />, { wrapper });

    /* Entries and invoices reference projects, so there is no delete. Each
       control names its project — a list of identical "Archive" buttons is
       unusable with a screen reader. */
    await user.click(await screen.findByLabelText('Archive Website redesign'));
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatchObject({ method: 'DELETE' });

    for (const forbidden of [/^delete/i, /remove/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).toBeNull();
    }
  });

  it('does not offer to add work to an archived client', async () => {
    serve([project()]);
    render(
      <ClientProjects
        client={{ ...NORTHWIND, archivedAt: '2026-01-01T00:00:00Z' } as Client}
      />,
      { wrapper },
    );

    /* An archived client is a finished engagement, so there is nothing to add
       work to — the page header drops its Archive button the same way. The
       existing projects still render: past invoices reference them. */
    await waitFor(() =>
      expect(screen.getByText('Website redesign')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Add project' })).toBeNull();
  });

  it('offers to add a project even with none, defaulting to this client', async () => {
    serve([]);
    const user = userEvent.setup();
    render(<ClientProjects client={NORTHWIND} />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Add project' }),
    );

    // Pre-selected: adding from the client's own page should not ask again
    // which client it belongs to.
    const select = (await screen.findByLabelText(
      'Client',
    )) as HTMLSelectElement;
    expect(select.value).toBe('c1');
  });
});
