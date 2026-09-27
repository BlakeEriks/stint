import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProjectList } from '@/components/project-list';
import type { Client, Project } from '@/lib/client/api';

/* Held in a box so a test can set the filter before rendering: the mock
   factory is hoisted above every other statement in this file. */
const search = { value: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useSearchParams: () => search.value,
  usePathname: () => '/projects',
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
  archivedAt: null,
} as unknown as Client;
const BYRNE = {
  id: 'c2',
  name: 'Byrne Studio',
  hourlyRate: null,
  color: null,
  archivedAt: null,
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

function serve(projects: Project[], clients: Client[]) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(String(url));
      const path = String(url).replace('/api/v1', '');
      if (path.startsWith('/projects')) {
        return new Response(JSON.stringify({ projects }), { status: 200 });
      }
      if (path.startsWith('/clients')) {
        /* A real server EXCLUDES archived clients unless asked. Returning
           them regardless would make the archived-client grouping test
           unfalsifiable — it would pass without includeArchived. */
        const visible = path.includes('includeArchived=true')
          ? clients
          : clients.filter((c) => !c.archivedAt);
        return new Response(JSON.stringify({ clients: visible }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ defaultHourlyRate: 125 }), {
        status: 200,
      });
    }),
  );
  return urls;
}

/** Group headings in render order. */
function headings() {
  return screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent?.trim());
}

afterEach(() => {
  vi.unstubAllGlobals();
  // The filter is module state, so a test that sets it would leak into the next.
  search.value = new URLSearchParams();
});

describe('ProjectList', () => {
  it('groups by client so identically-named projects can be told apart', async () => {
    serve(
      [
        project({ id: 'p1', name: 'Website redesign', clientId: 'c1' }),
        project({ id: 'p2', name: 'Website redesign', clientId: 'c2' }),
      ],
      [NORTHWIND, BYRNE],
    );
    render(<ProjectList />, { wrapper });

    /* The whole reason a flat list was rejected: two rows with the same name
       are indistinguishable until the client says which is which. */
    await waitFor(() => expect(headings()).toContain('Northwind'));
    expect(headings()).toContain('Byrne Studio');
    expect(screen.getAllByText('Website redesign')).toHaveLength(2);
  });

  it('reaches a project with no client, which has no detail page to open', async () => {
    serve([project({ clientId: null, name: 'Stint itself' })], [NORTHWIND]);
    render(<ProjectList />, { wrapper });

    /* THE reason this page exists. The client-nested section cannot show
       these: there is no client detail page, because there is no client. */
    await waitFor(() => expect(headings()).toContain('No client'));
    expect(screen.getByText('Stint itself')).toBeInTheDocument();
  });

  it('never labels work with no client as "internal"', async () => {
    serve(
      [
        project({ id: 'p1', clientId: null, name: 'Pitch: Contoso' }),
        project({
          id: 'p2',
          clientId: null,
          name: 'Admin',
          isBillableDefault: false,
        }),
      ],
      [],
    );
    render(<ProjectList />, { wrapper });

    /* null covers genuinely internal work, work NOT YET ASSIGNED (billable
       work that will silently never be billed) and speculative work. Calling
       the group "Internal" asserts intent the data does not carry — only
       isBillableDefault distinguishes them, and that is the user's answer. */
    await waitFor(() => expect(headings()).toContain('No client'));
    expect(screen.queryByText(/internal/i)).toBeNull();
  });

  it('puts "No client" last, as the residue rather than a peer', async () => {
    serve(
      [
        project({ id: 'p1', clientId: null, name: 'Admin' }),
        project({ id: 'p2', clientId: 'c2', name: 'Brand rebuild' }),
        project({ id: 'p3', clientId: 'c1', name: 'Warehouse' }),
      ],
      [NORTHWIND, BYRNE],
    );
    render(<ProjectList />, { wrapper });

    // Clients alphabetical, then the leftovers.
    await waitFor(() =>
      expect(headings()).toEqual(['Byrne Studio', 'Northwind', 'No client']),
    );
  });

  it('states the client rate on the heading, so an inherited row reads against it', async () => {
    serve([project({ hourlyRate: null })], [NORTHWIND]);
    render(<ProjectList />, { wrapper });

    /* The row shows the resolved figure and nothing about where it came
       from — naming the source on every row restated this heading. The
       hierarchy is legible from the grouping instead, which only works if
       the heading carries the client's own rate. */
    await waitFor(() =>
      expect(screen.getAllByText('$150.00/h').length).toBe(2),
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Northwind' })
      .parentElement?.parentElement;
    expect(heading?.textContent).toContain('$150.00/h');
  });

  it('keeps an archived client’s projects under that client, not "No client"', async () => {
    serve(
      [project({ clientId: 'c3', name: 'Old work' })],
      [
        {
          ...NORTHWIND,
          id: 'c3',
          name: 'Old Co',
          archivedAt: '2026-01-01T00:00:00Z',
        } as Client,
      ],
    );
    render(<ProjectList />, { wrapper });

    /* Archived is not gone: filing its projects under "No client" would be a
       lie, and they are exactly the rows someone checks when reviewing a
       finished engagement. */
    await waitFor(() => expect(headings()).toContain('Old Co'));
    expect(headings()).not.toContain('No client');
  });

  it('never drops a project whose client cannot be resolved', async () => {
    // A dangling client_id should not make a row vanish silently.
    serve([project({ clientId: 'gone', name: 'Orphaned work' })], []);
    render(<ProjectList />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Orphaned work')).toBeInTheDocument(),
    );
    expect(headings()).toContain('No client');
  });

  it('omits a client with no projects rather than an empty group', async () => {
    serve([project({ clientId: 'c1' })], [NORTHWIND, BYRNE]);
    render(<ProjectList />, { wrapper });

    // An empty client belongs on the clients list, not as a blank panel here.
    await waitFor(() => expect(headings()).toEqual(['Northwind']));
  });

  /* The filter lives in the URL, as on /clients, so the view is linkable and
     Back returns to it. These pin what the server is asked for and what
     survives the narrowing afterwards. */
  it('asks only for active projects until a filter says otherwise', async () => {
    const urls = serve([project()], [NORTHWIND]);
    render(<ProjectList />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Website redesign')).toBeInTheDocument(),
    );
    const projectUrls = urls.filter((u) => u.includes('/projects'));
    expect(projectUrls.length).toBeGreaterThan(0);
    expect(projectUrls.some((u) => u.includes('includeArchived'))).toBe(false);
  });

  it('narrows to archived only, though the server returns both', async () => {
    search.value = new URLSearchParams('status=archived');
    const urls = serve(
      [
        project({ id: 'p1', name: 'Website redesign' }),
        project({
          id: 'p2',
          name: 'Old site',
          archivedAt: '2026-01-04T00:00:00Z',
        }),
      ],
      [NORTHWIND],
    );
    render(<ProjectList />, { wrapper });

    /* `includeArchived` ADDS archived rows to the active ones, so "Archived"
       has to filter what came back — asking the server is not enough. */
    await waitFor(() =>
      expect(screen.getByText('Old site')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Website redesign')).not.toBeInTheDocument();
    expect(
      urls.some(
        (u) => u.includes('/projects') && u.includes('includeArchived=true'),
      ),
    ).toBe(true);
  });

  it('keeps both under "All"', async () => {
    search.value = new URLSearchParams('status=all');
    serve(
      [
        project({ id: 'p1', name: 'Website redesign' }),
        project({
          id: 'p2',
          name: 'Old site',
          archivedAt: '2026-01-04T00:00:00Z',
        }),
      ],
      [NORTHWIND],
    );
    render(<ProjectList />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Website redesign')).toBeInTheDocument(),
    );
    expect(screen.getByText('Old site')).toBeInTheDocument();
  });

  it('filters with linked tabs, not a local toggle', async () => {
    search.value = new URLSearchParams('status=archived');
    serve([], []);
    render(<ProjectList />, { wrapper });

    const nav = await screen.findByRole('navigation', { name: 'Filter' });
    const links = Array.from(nav.querySelectorAll('a')).map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Active', '/projects'],
      ['Archived', '/projects?status=archived'],
      ['All', '/projects?status=all'],
    ]);
    expect(screen.getByRole('link', { name: 'Archived' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByText(/show archived/i)).toBeNull();
    await waitFor(() =>
      expect(screen.getByText('No archived projects.')).toBeInTheDocument(),
    );
  });
});
