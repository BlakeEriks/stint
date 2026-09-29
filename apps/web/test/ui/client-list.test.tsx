import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ClientList } from '@/components/client-list';
import type { ClientWithScale, Project } from '@/lib/client/api';

/* Held in a box so a test can set the filter before rendering: the mock
   factory is hoisted above every other statement in this file. */
const search = { value: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useSearchParams: () => search.value,
  usePathname: () => '/clients',
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ARCHIVED = '2026-01-04T00:00:00Z';

function client(over: Partial<ClientWithScale> = {}): ClientWithScale {
  return {
    id: 'c1',
    name: 'Northwind',
    email: null,
    hourlyRate: 150,
    color: null,
    archivedAt: null,
    projectCount: 0,
    unbilledAmount: 0,
    ...over,
  } as ClientWithScale;
}
const NORTHWIND = client();
const BYRNE = client({ id: 'c2', name: 'Byrne Studio', hourlyRate: null });

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

function serve(clients: ClientWithScale[], projects: Project[] = []) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      const path = String(url).replace('/api/v1', '');
      /* A write never answers, so a test sees only what the press predicted
         (Constitution VI) — never the refetch after it. */
      if (init?.method && init.method !== 'GET') return new Promise(() => {});
      /* A real server EXCLUDES archived rows unless asked. Returning them
         regardless would make every archived-grouping test unfalsifiable. */
      const asked = path.includes('includeArchived=true');
      if (path.startsWith('/projects')) {
        const visible = asked
          ? projects
          : projects.filter((p) => !p.archivedAt);
        return new Response(JSON.stringify({ projects: visible }), {
          status: 200,
        });
      }
      if (path.startsWith('/clients')) {
        const visible = asked ? clients : clients.filter((c) => !c.archivedAt);
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

describe('ClientList', () => {
  it('groups projects by client so identically-named projects can be told apart', async () => {
    serve(
      [NORTHWIND, BYRNE],
      [
        project({ id: 'p1', name: 'Website redesign', clientId: 'c1' }),
        project({ id: 'p2', name: 'Website redesign', clientId: 'c2' }),
      ],
    );
    render(<ClientList />, { wrapper });

    await waitFor(() => expect(headings()).toContain('Northwind'));
    expect(headings()).toContain('Byrne Studio');
    expect(screen.getAllByText('Website redesign')).toHaveLength(2);
  });

  it('keeps a client with no projects, since this is the only list of clients', async () => {
    serve([NORTHWIND, BYRNE], [project({ clientId: 'c1' })]);
    render(<ClientList />, { wrapper });

    await waitFor(() =>
      expect(headings()).toEqual(['Byrne Studio', 'Northwind']),
    );
  });

  it('opens a client from its heading', async () => {
    serve([NORTHWIND]);
    render(<ClientList />, { wrapper });

    const link = await screen.findByRole('link', { name: 'Northwind' });
    expect(link).toHaveAttribute('href', '/clients/c1');
  });

  it('reaches a project with no client, which has no detail page to open', async () => {
    serve([NORTHWIND], [project({ clientId: null, name: 'Stint itself' })]);
    render(<ClientList />, { wrapper });

    /* The client-nested section cannot show these: there is no client detail
       page, because there is no client. */
    await waitFor(() => expect(headings()).toContain('No client'));
    expect(screen.getByText('Stint itself')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'No client' })).toBeNull();
  });

  it('never labels work with no client as "internal"', async () => {
    serve(
      [],
      [
        project({ id: 'p1', clientId: null, name: 'Pitch: Contoso' }),
        project({
          id: 'p2',
          clientId: null,
          name: 'Admin',
          isBillableDefault: false,
        }),
      ],
    );
    render(<ClientList />, { wrapper });

    /* null covers genuinely internal work, work NOT YET ASSIGNED (billable
       work that will silently never be billed) and speculative work. Calling
       the group "Internal" asserts intent the data does not carry — only
       isBillableDefault distinguishes them, and that is the user's answer. */
    await waitFor(() => expect(headings()).toContain('No client'));
    expect(screen.queryByText(/internal/i)).toBeNull();
  });

  it('puts "No client" last, as the residue rather than a peer', async () => {
    serve(
      [NORTHWIND, BYRNE],
      [
        project({ id: 'p1', clientId: null, name: 'Admin' }),
        project({ id: 'p2', clientId: 'c2', name: 'Brand rebuild' }),
        project({ id: 'p3', clientId: 'c1', name: 'Warehouse' }),
      ],
    );
    render(<ClientList />, { wrapper });

    await waitFor(() =>
      expect(headings()).toEqual(['Byrne Studio', 'Northwind', 'No client']),
    );
  });

  it('never drops a project whose client cannot be resolved', async () => {
    // A dangling client_id should not make a row vanish silently.
    serve([], [project({ clientId: 'gone', name: 'Orphaned work' })]);
    render(<ClientList />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Orphaned work')).toBeInTheDocument(),
    );
    expect(headings()).toContain('No client');
  });

  describe('the card', () => {
    it('carries the client’s rate and billing email, and no report figures', async () => {
      serve([
        client({
          email: 'ap@northwind.test',
          projectCount: 3,
          unbilledAmount: 1462.5,
        }),
      ]);
      render(<ClientList />, { wrapper });

      /* This screen manages clients and projects. What is owed and how many
         hours went in belong to a reports screen, so the server isn't even
         asked for them. */
      await waitFor(() =>
        expect(screen.getByText(/ap@northwind\.test/)).toBeInTheDocument(),
      );
      expect(screen.getByText(/\$150\.00\/h/)).toBeInTheDocument();
      expect(screen.queryByText(/unbilled/)).toBeNull();
      expect(screen.queryByText(/\d+ projects?/)).toBeNull();
    });

    it('marks a rate the client inherits as the default', async () => {
      serve([BYRNE]);
      render(<ClientList />, { wrapper });
      await waitFor(() =>
        expect(screen.getByText(/\$125\.00\/h · default/)).toBeInTheDocument(),
      );
    });

    it('gives each project its resolved rate and where that rate comes from', async () => {
      serve(
        [NORTHWIND, BYRNE],
        [
          project({ id: 'p1', clientId: 'c1', name: 'Rush', hourlyRate: 195 }),
          project({ id: 'p2', clientId: 'c1', name: 'Warehouse' }),
          project({ id: 'p3', clientId: 'c2', name: 'Brand' }),
        ],
      );
      render(<ClientList />, { wrapper });

      /* A bare figure hides whether changing the client's rate would move
         it. Money keeps its cents, as it does everywhere. */
      await waitFor(() =>
        expect(screen.getByText('own rate')).toBeInTheDocument(),
      );
      expect(screen.getByText('$195.00/h')).toBeInTheDocument();
      expect(screen.getByText('from client')).toBeInTheDocument();
      expect(screen.getByText('from default')).toBeInTheDocument();
    });

    it('says when a client has no projects yet', async () => {
      serve([NORTHWIND]);
      render(<ClientList />, { wrapper });
      expect(await screen.findByText('No projects yet.')).toBeInTheDocument();
    });
  });

  it('adds a client from the header, and nothing else', async () => {
    serve([]);
    render(<ClientList />, { wrapper });

    expect(
      await screen.findByRole('link', { name: /Add client/ }),
    ).toHaveAttribute('href', '/clients/new');
    // A project is added from the card it belongs to.
    expect(screen.queryByRole('button', { name: /Add project/ })).toBeNull();
  });

  it('adds a project to the client whose card it was asked from', async () => {
    serve([NORTHWIND, BYRNE]);
    const user = userEvent.setup();
    render(<ClientList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Project for Northwind' }),
    );

    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Client' }),
      ).toHaveTextContent('Northwind'),
    );
  });

  it('edits a project from its row, which is the one button', async () => {
    serve([NORTHWIND], [project({ clientId: 'c1', name: 'Warehouse' })]);
    const user = userEvent.setup();
    render(<ClientList />, { wrapper });

    const row = await screen.findByRole('button', { name: 'Edit Warehouse' });
    // No Edit button inside the row: the card's one Edit is the client's.
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Edit/ })).toHaveLength(2);

    await user.click(screen.getByText('Warehouse'));
    expect(
      await screen.findByRole('heading', { name: 'Edit project' }),
    ).toBeInTheDocument();
  });

  it('edits a client in a dialog, as a project is', async () => {
    serve([NORTHWIND]);
    const user = userEvent.setup();
    render(<ClientList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Edit Northwind' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Edit client' }),
    ).toBeInTheDocument();
  });

  it('hides a client archived from its dialog before the server answers', async () => {
    serve([NORTHWIND, BYRNE], [project({ clientId: 'c1', name: 'Warehouse' })]);
    const user = userEvent.setup();
    render(<ClientList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Edit Northwind' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Archive' }));

    /* This screen holds its clients in a list that includes archived ones,
       so the prediction marks the client archived there rather than
       dropping it — and Active hides it, with its project, on the press. */
    await waitFor(() => expect(headings()).toEqual(['Byrne Studio']));
    expect(screen.queryByText('Warehouse')).toBeNull();
  });

  /* The filter lives in the URL rather than component state, so the view is
     linkable and Back returns to it. A project whose client is archived
     counts as archived, without a write to the project: unarchiving the
     client then restores exactly what was active before. */
  describe('filters', () => {
    const OLD_CO = client({ id: 'c3', name: 'Old Co', archivedAt: ARCHIVED });

    it('asks only for active projects until a filter says otherwise', async () => {
      const urls = serve([NORTHWIND], [project()]);
      render(<ClientList />, { wrapper });

      await waitFor(() =>
        expect(screen.getByText('Website redesign')).toBeInTheDocument(),
      );
      const projectUrls = urls.filter((u) => u.includes('/projects'));
      expect(projectUrls.length).toBeGreaterThan(0);
      expect(projectUrls.some((u) => u.includes('includeArchived'))).toBe(
        false,
      );
    });

    it('hides an archived client under Active, with its active project', async () => {
      serve(
        [NORTHWIND, OLD_CO],
        [project({ id: 'p9', clientId: 'c3', name: 'Old work' })],
      );
      render(<ClientList />, { wrapper });

      await waitFor(() => expect(headings()).toEqual(['Northwind']));
      // Not re-filed under "No client" either: that would be a lie.
      expect(screen.queryByText('Old work')).toBeNull();
    });

    it('shows an archived client under Archived with all its projects', async () => {
      search.value = new URLSearchParams('status=archived');
      serve(
        [NORTHWIND, OLD_CO],
        [
          project({ id: 'p8', clientId: 'c1', name: 'Warehouse' }),
          project({ id: 'p9', clientId: 'c3', name: 'Old work' }),
          project({
            id: 'p10',
            clientId: 'c3',
            name: 'Older work',
            archivedAt: ARCHIVED,
          }),
        ],
      );
      render(<ClientList />, { wrapper });

      await waitFor(() => expect(headings()).toEqual(['Old Co']));
      expect(screen.getByText('Old work')).toBeInTheDocument();
      expect(screen.getByText('Older work')).toBeInTheDocument();
      // An active client with nothing archived has no place here.
      expect(screen.queryByText('Warehouse')).toBeNull();
    });

    it('files an archived project under its active client, unbadged', async () => {
      search.value = new URLSearchParams('status=archived');
      serve(
        [NORTHWIND],
        [
          project({ id: 'p1', name: 'Website redesign' }),
          project({ id: 'p2', name: 'Old site', archivedAt: ARCHIVED }),
        ],
      );
      render(<ClientList />, { wrapper });

      await waitFor(() => expect(headings()).toEqual(['Northwind']));
      expect(screen.getByText('Old site')).toBeInTheDocument();
      expect(screen.queryByText('Website redesign')).toBeNull();
      // The one Archived badge is the project's; the client is active.
      expect(
        screen.getAllByText('Archived', { selector: 'span' }),
      ).toHaveLength(1);
    });

    it('keeps everything under All', async () => {
      search.value = new URLSearchParams('status=all');
      serve(
        [NORTHWIND, OLD_CO],
        [
          project({ id: 'p1', name: 'Website redesign' }),
          project({ id: 'p2', name: 'Old site', archivedAt: ARCHIVED }),
          project({ id: 'p9', clientId: 'c3', name: 'Old work' }),
        ],
      );
      render(<ClientList />, { wrapper });

      await waitFor(() => expect(headings()).toEqual(['Northwind', 'Old Co']));
      expect(screen.getByText('Website redesign')).toBeInTheDocument();
      expect(screen.getByText('Old site')).toBeInTheDocument();
      expect(screen.getByText('Old work')).toBeInTheDocument();
    });

    it('filters with linked tabs, not a local toggle', async () => {
      search.value = new URLSearchParams('status=archived');
      serve([]);
      render(<ClientList />, { wrapper });

      const nav = await screen.findByRole('navigation', { name: 'Filter' });
      const links = Array.from(nav.querySelectorAll('a')).map((a) => [
        a.textContent,
        a.getAttribute('href'),
      ]);
      expect(links).toEqual([
        ['Active', '/clients'],
        ['Archived', '/clients?status=archived'],
        ['All', '/clients?status=all'],
      ]);
      expect(screen.getByRole('link', { name: 'Archived' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await waitFor(() =>
        expect(screen.getByText('Nothing archived.')).toBeInTheDocument(),
      );
    });
  });

  it('offers to add a client when there is nothing yet', async () => {
    serve([]);
    render(<ClientList />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/No clients yet/)).toBeInTheDocument(),
    );
  });

  it('says a failed query failed, rather than loading forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'INTERNAL', message: 'boom' }), {
            status: 500,
          }),
      ),
    );
    render(<ClientList />, { wrapper });

    /* The regression this exists for: every screen hand-rolled loading and
       empty and none wrote a failure, so an errored query said "Loading…"
       for as long as the tab stayed open. */
    await waitFor(() =>
      expect(screen.getByText(/could not load/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    // Neutral, never red: a list that could not load is a condition.
    expect(screen.getByText(/could not load/i).className).not.toMatch(/danger/);
  });
});
