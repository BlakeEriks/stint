import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ClientList } from '@/components/client-list';
import type { ClientWithScale } from '@/lib/client/api';

/* Held in a box so a test can set the filter before rendering: the mock
   factory is hoisted above every other statement in this file. */
const search = { value: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useSearchParams: () => search.value,
  usePathname: () => '/clients',
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function client(over: Partial<ClientWithScale> = {}): ClientWithScale {
  return {
    id: 'c1',
    name: 'Northwind',
    email: null,
    hourlyRate: 150,
    color: null,
    archivedAt: null,
    projectCount: 3,
    unbilledAmount: 1462.5,
    ...over,
  } as ClientWithScale;
}

function serve(clients: ClientWithScale[]) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ clients }), { status: 200 });
    }),
  );
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // The filter is module state, so a test that sets it would leak into the next.
  search.value = new URLSearchParams();
});

describe('ClientList', () => {
  it('asks the server for scale rather than deriving it in the browser', async () => {
    const urls = serve([client()]);
    render(<ClientList />, { wrapper });

    /* The unbilled figure comes from the SQL rollup, whose coalesce chain
       matches resolve_entry_rate. Recomputing it here would be a third
       implementation of rate resolution. */
    await waitFor(() =>
      expect(urls.some((u) => u.includes('withScale=true'))).toBe(true),
    );
  });

  it('shows both the count and the money, so the row answers "where is my work?"', async () => {
    serve([client()]);
    render(<ClientList />, { wrapper });

    await waitFor(() =>
      expect(
        screen.getByText('3 projects · $1,462.50 unbilled'),
      ).toBeInTheDocument(),
    );
  });

  it('says "1 project", not "1 projects"', async () => {
    serve([client({ projectCount: 1, unbilledAmount: 0 })]);
    render(<ClientList />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('1 project')).toBeInTheDocument(),
    );
  });

  it('omits a zero unbilled total rather than printing $0.00', async () => {
    serve([client({ projectCount: 2, unbilledAmount: 0 })]);
    render(<ClientList />, { wrapper });

    /* Everything invoiced is the quiet good state. "$0.00 unbilled" reads as
       a figure worth checking when it is the absence of one. */
    await waitFor(() =>
      expect(screen.getByText('2 projects')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it('renders no scale line at all for an empty client', async () => {
    serve([client({ projectCount: 0, unbilledAmount: 0 })]);
    render(<ClientList />, { wrapper });

    // A row of zeroes is noise; the name alone is the whole truth here.
    await waitFor(() =>
      expect(screen.getByText('Northwind')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/project/)).toBeNull();
    expect(screen.queryByText(/unbilled/)).toBeNull();
  });

  it('still shows the email, which the scale line displaced', async () => {
    serve([client({ email: 'ap@northwind.test' })]);
    render(<ClientList />, { wrapper });

    /* The email had its own column. Adding a second line on the left made it
       compete for width and truncate to NOTHING — it rendered an empty span,
       so the field was silently gone rather than visibly cut. It now joins
       the detail line. */
    await waitFor(() =>
      expect(
        screen.getByText(
          /3 projects · \$1,462\.50 unbilled · ap@northwind\.test/,
        ),
      ).toBeInTheDocument(),
    );
  });

  it('shows money owed by a client with no projects', async () => {
    serve([client({ projectCount: 0, unbilledAmount: 187.5 })]);
    render(<ClientList />, { wrapper });

    /* Time can be tracked against a client directly, so unbilled work with
       no project is real and must not be hidden by the count being zero. */
    await waitFor(() =>
      expect(screen.getByText('$187.50 unbilled')).toBeInTheDocument(),
    );
  });

  /* The filter lives in the URL rather than component state, so the view is
     linkable and Back returns to it. These pin the two halves of that: what
     the server is asked for, and what survives the narrowing afterwards. */
  it('asks only for active clients until a filter says otherwise', async () => {
    const urls = serve([client()]);
    render(<ClientList />, { wrapper });

    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(urls.some((u) => u.includes('includeArchived'))).toBe(false);
  });

  it('narrows to archived only, though the server returns both', async () => {
    search.value = new URLSearchParams('status=archived');
    serve([
      client({ id: 'c1', name: 'Northwind' }),
      client({ id: 'c2', name: 'Quill', archivedAt: '2026-01-04T00:00:00Z' }),
    ]);
    render(<ClientList />, { wrapper });

    /* `includeArchived` ADDS archived rows to the active ones, so "Archived"
       has to filter what came back — asking the server is not enough. */
    await waitFor(() => expect(screen.getByText('Quill')).toBeInTheDocument());
    expect(screen.queryByText('Northwind')).not.toBeInTheDocument();
  });

  it('keeps both under "All"', async () => {
    search.value = new URLSearchParams('status=all');
    serve([
      client({ id: 'c1', name: 'Northwind' }),
      client({ id: 'c2', name: 'Quill', archivedAt: '2026-01-04T00:00:00Z' }),
    ]);
    render(<ClientList />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Northwind')).toBeInTheDocument(),
    );
    expect(screen.getByText('Quill')).toBeInTheDocument();
  });
});
