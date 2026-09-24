import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ImportPreview } from '@stint/core';
import { ImportPage } from '@/components/import-page';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function preview(over: Partial<ImportPreview> = {}): ImportPreview {
  return {
    source: 'toggl',
    rows: [],
    clients: [
      {
        id: 'c1',
        key: 'northwind',
        name: 'Northwind',
        isNew: false,
        hourlyRate: 150,
        color: '#6FA8FF',
        invoicedThrough: null,
        seconds: 7200,
      },
      {
        id: 'c2',
        key: 'globex',
        name: 'Globex',
        isNew: true,
        hourlyRate: null,
        color: null,
        invoicedThrough: null,
        seconds: 3600,
      },
    ],
    newProjects: [{ id: 'p2', name: 'Onboarding', clientId: 'c2' }],
    overlaps: [
      {
        rowId: 'r1',
        sourceRowId: 's1',
        taskName: 'API refactor',
        startedAt: '2026-08-04T13:00:00.000Z',
        otherTaskName: 'API refactor',
        otherInStint: true,
        seconds: 10800,
        excluded: false,
      },
      {
        rowId: 'r2',
        sourceRowId: 's2',
        taskName: 'Design review',
        startedAt: '2026-08-03T18:00:00.000Z',
        otherTaskName: 'Checkout rebuild',
        otherInStint: false,
        seconds: 3600,
        excluded: false,
      },
    ],
    defaultRate: 125,
    summary: {
      totalRows: 5,
      willWriteCount: 5,
      newCount: 5,
      alreadyImportedCount: 0,
      unratedCount: 0,
      overlappingCount: 2,
      excludedCount: 0,
      invoicedElsewhereCount: 0,
      firstStartedAt: '2026-07-01T13:00:00.000Z',
      lastEndedAt: '2026-09-24T18:45:00.000Z',
      exportedNoneBillable: false,
    },
    ...over,
  };
}

/** Every request's form, in order; each answers with `next()`. */
function serve(next: () => ImportPreview) {
  const sent: { url: string; form: FormData }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), form: init.body as FormData });
      const body = String(url).endsWith('/confirm')
        ? {
            source: 'toggl',
            written: 5,
            alreadyImported: 0,
            unrated: 0,
            overlapping: 0,
            excluded: 0,
            invoicedElsewhere: 0,
          }
        : next();
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return sent;
}

const field = (f: FormData, name: string) => JSON.parse(String(f.get(name)));

async function chooseFile(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    screen.getByLabelText('Export file'),
    new File(['x'], 'toggl.csv', { type: 'text/csv' }),
  );
  await screen.findByText('5 new entries from Toggl');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ImportPage', () => {
  it('says in one line what confirming adds, and ends with Import', async () => {
    serve(() => preview());
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    expect(
      screen.getByText('1 new client · 1 new project'),
    ).toBeInTheDocument();
    expect(screen.getByText('Clients in this file')).toBeInTheDocument();
    expect(
      screen.getByText('2 entries overlap other work'),
    ).toBeInTheDocument();

    /* Import comes after every choice it depends on. */
    const button = screen.getByRole('button', { name: 'Import 5 entries' });
    const overlaps = screen.getByText('2 entries overlap other work');
    expect(
      overlaps.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('names where each overlap sits', async () => {
    serve(() => preview());
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    expect(
      screen.getByText(/overlaps API refactor · in Stint/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/overlaps Checkout rebuild · in this file/),
    ).toBeInTheDocument();
  });

  it('re-reads the file with an exclusion, and Undo offers it back', async () => {
    let current = preview();
    const sent = serve(() => current);
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    current = preview({
      overlaps: current.overlaps.map((o) =>
        o.sourceRowId === 's1' ? { ...o, excluded: true } : o,
      ),
      summary: { ...current.summary, newCount: 4, overlappingCount: 1 },
    });
    await user.click(
      screen.getByRole('button', { name: 'Exclude API refactor' }),
    );

    await screen.findByRole('button', { name: 'Import 4 entries' });
    expect(field(sent.at(-1)?.form as FormData, 'excluded')).toEqual(['s1']);
    expect(screen.getByText(/won't import/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Undo excluding API refactor' }),
    ).toBeInTheDocument();
  });

  it('Exclude all sends every overlap still open', async () => {
    const sent = serve(() => preview());
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    await user.click(screen.getByRole('button', { name: 'Exclude all 2' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(field(sent[1]?.form as FormData, 'excluded')).toEqual(['s1', 's2']);
  });

  it('shows five overlaps, then the rest behind Show more', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      ...preview().overlaps[0],
      rowId: `r${i}`,
      sourceRowId: `s${i}`,
      taskName: `Task ${i}`,
    })) as ImportPreview['overlaps'];
    serve(() => preview({ overlaps: many }));
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    expect(screen.queryByText('Task 5')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getByText('Task 6')).toBeInTheDocument();
  });

  it("a new client's rate re-reads the file on blur; an existing client's is only shown", async () => {
    const sent = serve(() => preview());
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    expect(screen.queryByLabelText('Northwind rate')).not.toBeInTheDocument();
    expect(screen.getByText('$150.00/h')).toBeInTheDocument();

    const rate = screen.getByLabelText('Globex rate');
    expect(rate).toHaveAttribute('placeholder', '125 default');
    await user.type(rate, '175');
    expect(sent).toHaveLength(1);
    await user.tab();

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(field(sent[1]?.form as FormData, 'clients')).toEqual({
      globex: { hourlyRate: 175 },
    });
  });

  it('marks the rate field when there is no default to fall back to', async () => {
    serve(() => preview({ defaultRate: null }));
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    const rate = screen.getByLabelText('Globex rate');
    expect(rate).toHaveAttribute('placeholder', 'rate');
    expect(rate).toHaveAttribute('aria-invalid', 'true');
  });

  it("each client's invoiced-through date re-reads the file", async () => {
    const sent = serve(() => preview());
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    await user.type(
      screen.getByLabelText('Northwind invoiced through'),
      '2025-12-31',
    );
    await waitFor(() =>
      expect(field(sent.at(-1)?.form as FormData, 'clients')).toEqual({
        northwind: { invoicedThrough: '2025-12-31' },
      }),
    );
  });

  it("a new client's colour is sent with the confirm, without re-reading the file", async () => {
    const sent = serve(() => preview());
    const user = userEvent.setup();
    render(<ImportPage />, { wrapper });
    await chooseFile(user);

    await user.click(screen.getByRole('button', { name: 'Globex colour' }));
    const picker = await screen.findByRole('group', { name: 'Globex colour' });
    const [, first] = within(picker).getAllByRole('button');
    await user.click(first as HTMLElement);
    expect(sent).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Import 5 entries' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.url).toContain('/imports/confirm');
    expect(field(sent[1]?.form as FormData, 'clients').globex.color).toMatch(
      /^#[0-9A-F]{6}$/i,
    );
  });
});
