import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Inbox } from '@/components/inbox';
import { MutationNotice } from '@/components/mutation-notice';
import type { Stats } from '@/lib/client/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

function stats(attention: Partial<Stats['attention']> = {}): Stats {
  return {
    currency: 'USD',
    unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
    week: [],
    month: {
      earned: 0,
      projected: null,
      businessDaysElapsed: 0,
      businessDaysTotal: 0,
      series: [],
      projection: null,
      byClient: [],
    },
    awaitingPayment: 0,
    openInvoiceCount: 0,
    collected: {
      trailing12: 0,
      thisMonth: 0,
      daysSincePaid: null,
      byMonth: [],
    },
    earnedToday: 0,
    attention: {
      overdueInvoices: [],
      staleDrafts: [],
      unprojected: [],
      strangeDurations: [],
      overlaps: [],
      ...attention,
    },
  } as Stats;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ENTRY_ID = '018f0000-0000-7000-8000-0000000000e1';

/** One unprojected entry, as `/stats` returns it. */
const unprojectedEntry = {
  entryId: ENTRY_ID,
  taskName: 'Client call',
  startedAt: '2026-09-11T09:00:00.000Z',
  seconds: 5400,
};

const longEntry = {
  entryId: '018f0000-0000-7000-8000-0000000000f1',
  kind: 'long' as const,
  taskName: 'Migration',
  projectName: 'Website',
  clientName: 'Acme',
  startedAt: '2026-09-11T09:00:00.000Z',
  seconds: 42000,
};

const overdue = {
  invoiceId: 'i1',
  invoiceNumber: 'STINT-0001',
  clientId: 'c1',
  clientName: 'Northwind',
  amount: 900,
  currency: 'USD',
  daysLate: 12,
};

afterEach(() => vi.unstubAllGlobals());

describe('Inbox', () => {
  it('names the invoice in every action, even where the label is generic', () => {
    render(<Inbox stats={stats({ overdueInvoices: [overdue] })} />, {
      wrapper,
    });

    /* The visible label is the verb alone — the row already names its invoice
       twice above. A screen reader meets the buttons without that context, so
       the accessible name still carries it: a column of identical "Mark paid"
       and "Download" buttons would be unusable. */
    const paid = screen.getByRole('button', { name: 'Mark STINT-0001 paid' });
    expect(paid).toHaveTextContent('Mark paid');
    expect(paid).not.toHaveTextContent('STINT-0001');

    const pdf = screen.getByRole('link', { name: 'Download STINT-0001' });
    expect(pdf).toHaveTextContent('Download');
    expect(pdf).not.toHaveTextContent('STINT-0001');
  });

  it('offers nothing destructive', () => {
    render(<Inbox stats={stats({ overdueInvoices: [overdue] })} />, {
      wrapper,
    });

    /* Voiding and deleting belong on the invoice itself, where the whole
       document is in view. A stray click in a dock must not destroy a
       financial record. */
    for (const word of [/void/i, /delete/i, /remove/i]) {
      expect(screen.queryByRole('button', { name: word })).toBeNull();
    }
  });

  /**
   * Severity is one 2px edge inside the card, and half the rows
   * have none. `danger` is the overdue invoice, where money is already late;
   * `warning` is a length that wants a look; a stale draft and an
   * unprojected entry are chores and draw nothing.
   *
   * Asserted over a FULL inbox, because the rule is about the column: two
   * flagged cards among five is a signal, five is a texture.
   */
  it('flags the overdue invoice and the odd length, and nothing else', () => {
    const { container } = render(
      <Inbox
        stats={stats({
          overdueInvoices: [overdue],
          staleDrafts: [
            {
              invoiceId: 'd1',
              invoiceNumber: 'STINT-0019',
              clientId: 'c1',
              clientName: 'Byrne Studio',
              amount: 780,
              currency: 'USD',
              ageDays: 13,
            },
          ],
          unprojected: [unprojectedEntry],
          strangeDurations: [longEntry],
        })}
      />,
      { wrapper },
    );

    const tone = (name: string) =>
      screen.getByText(name).closest('[data-tone]')?.getAttribute('data-tone');

    expect(container.querySelectorAll('[data-tone]')).toHaveLength(4);
    expect(tone('Northwind')).toBe('danger');
    expect(tone('Migration')).toBe('warning');
    /* A chore is not a fault. */
    expect(tone('Byrne Studio')).toBe('neutral');
    expect(tone('Client call')).toBe('neutral');
  });
});

/**
 * The unprojected row.
 *
 * Unlike every other row it names no record with a page of its own — there is
 * no entries list to land on, and the entries scatter across days, so the
 * today-only list on Home would not reach them. It is a queue of decisions,
 * and the editor is what makes one.
 */
describe('entries with no project', () => {
  const ENTRY = {
    id: ENTRY_ID,
    taskName: 'Untitled',
    projectId: null,
    startedAt: '2026-09-11T09:00:00.000Z',
    endedAt: '2026-09-11T10:00:00.000Z',
    isBillable: true,
    durationSeconds: 3600,
  };

  function serve() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = String(url).replace('/api/v1', '');
        // `/entries/:id` returns the entry itself; `/entries` a list.
        if (/^\/entries\/[^/]/.test(path))
          return new Response(JSON.stringify(ENTRY), { status: 200 });
        if (path.startsWith('/entries'))
          return new Response(JSON.stringify({ entries: [ENTRY] }), {
            status: 200,
          });
        if (path.startsWith('/projects'))
          return new Response(JSON.stringify({ projects: [] }), {
            status: 200,
          });
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
  }

  const withRow = () => stats({ unprojected: [unprojectedEntry] });

  it('says why when the entry cannot be opened', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        /\/entries\/[^/]/.test(String(url))
          ? new Response(
              JSON.stringify({
                code: 'NOT_FOUND',
                message: 'That entry no longer exists.',
              }),
              { status: 404 },
            )
          : new Response(JSON.stringify({ projects: [] }), { status: 200 }),
      ),
    );
    const user = userEvent.setup();
    render(
      <>
        <Inbox stats={withRow()} />
        <MutationNotice />
      </>,
      { wrapper },
    );

    await user.click(screen.getByText('Client call'));

    expect(
      await screen.findByText('That entry no longer exists.'),
    ).toBeInTheDocument();
  });

  it('lands the cursor on the project, the field the row is about', async () => {
    serve();
    const user = userEvent.setup();
    render(<Inbox stats={withRow()} />, { wrapper });

    await user.click(screen.getByText('Client call'));
    await screen.findByRole('dialog');

    /* The row exists BECAUSE the project is missing; the task name is already
       right. Opening on the task would make the first keystroke edit the one
       field nobody came to change. */
    await waitFor(() =>
      expect(document.activeElement?.id).toBe('entry-project'),
    );
  });

  it('is never a create form — the row edits, it does not add', async () => {
    serve();
    const user = userEvent.setup();
    render(<Inbox stats={withRow()} />, { wrapper });

    await user.click(screen.getByText('Client call'));

    /* "Edit entry", never "Add entry". The row names existing work that needs
       a project; offering to CREATE one from it would be the opposite of what
       was asked, on a surface where a stray click already writes.

       This is a weaker test than it looks, and the gap is recorded on
       purpose: the bug it was written for — the dialog reopening blank after
       a save, because the open flag was an id while the entry came from a
       query that had just stopped returning it — is NOT reproduced here, and
       I could not build a jsdom sequence that failed against the broken
       version. It was found and fixed in a browser. The structural fix is
       that `assigning` holds the ENTRY, so the two cannot disagree; if that
       ever goes back to an id, this test will not catch it. */
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/Edit entry/);
    expect(screen.queryByText('Add entry')).toBeNull();
  });
});

/**
 * The strange-duration row.
 *
 * A record already written. It is the only row gated by a STORED answer, because its condition never
 * stops holding on its own: a nine-hour entry stays nine hours forever.
 */
describe('entries of unusual length', () => {
  const ENTRY = {
    id: longEntry.entryId,
    taskName: 'Migration',
    projectId: 'p1',
    startedAt: '2026-09-11T09:00:00.000Z',
    endedAt: '2026-09-11T20:40:00.000Z',
    isBillable: true,
    durationSeconds: 42000,
    durationOk: false,
  };

  function serve() {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace('/api/v1', '');
      if (/^\/entries\/[^/]/.test(path))
        return new Response(
          JSON.stringify({
            ...ENTRY,
            ...(init?.body ? JSON.parse(String(init.body)) : {}),
          }),
          {
            status: 200,
          },
        );
      if (path.startsWith('/projects'))
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('answers with durationOk and edits nothing else', async () => {
    const fetchMock = serve();
    const user = userEvent.setup();
    render(<Inbox stats={stats({ strangeDurations: [longEntry] })} />, {
      wrapper,
    });

    await user.click(screen.getByRole('button', { name: /as it is/ }));

    /* "It's correct" is an answer about the length, not an edit to it — a
       write touching the times would be the app editing billable work. */
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patch).toBeTruthy();
      expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({
        durationOk: true,
      });
    });
  });

  it('sends the row out on the press, before the server answers', async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.method === 'PATCH'
          ? new Promise<Response>((r) => {
              answer = r;
            })
          : Promise.resolve(new Response('{}', { status: 200 })),
      ),
    );
    const user = userEvent.setup();
    render(<Inbox stats={stats({ strangeDurations: [longEntry] })} />, {
      wrapper,
    });

    await user.click(screen.getByRole('button', { name: /as it is/ }));

    expect(
      screen.getByText('Migration').closest('[data-exiting]'),
    ).not.toBeNull();
    answer(new Response(JSON.stringify(ENTRY), { status: 200 }));
  });

  it('brings the row back and says why when the server refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'PATCH'
          ? new Response(
              JSON.stringify({
                code: 'CONFLICT',
                message: 'That entry is billed.',
              }),
              { status: 409 },
            )
          : new Response('{}', { status: 200 }),
      ),
    );
    const user = userEvent.setup();
    render(
      <>
        <Inbox stats={stats({ strangeDurations: [longEntry] })} />
        <MutationNotice />
      </>,
      { wrapper },
    );

    await user.click(screen.getByRole('button', { name: /as it is/ }));

    expect(
      await screen.findByText('That entry is billed.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Migration').closest('[data-exiting]')).toBeNull();
  });
});

describe('overlap row', () => {
  const overlap = {
    entryId: '018f0000-0000-7000-8000-0000000000a2',
    taskName: 'Standup',
    otherEntryId: '018f0000-0000-7000-8000-0000000000a1',
    otherTaskName: 'Foundation POC',
    startedAt: '2026-08-19T15:00:00.000Z',
    seconds: 180,
  };

  beforeEach(() => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url).replace('/api/v1', '');
      if (path.startsWith('/entries/'))
        return new Response(
          JSON.stringify({
            id: overlap.entryId,
            taskName: 'Standup',
            projectId: null,
            startedAt: overlap.startedAt,
            endedAt: '2026-08-19T15:21:00.000Z',
            isBillable: true,
            rateOverride: null,
            invoiceId: null,
            durationSeconds: 1260,
            durationOk: false,
          }),
          { status: 200 },
        );
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('is resolved by editing, and offers no "it\'s correct"', async () => {
    const user = userEvent.setup();
    render(<Inbox stats={stats({ overlaps: [overlap] })} />, { wrapper });
    expect(screen.queryByRole('button', { name: /as it is/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit Standup' }));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        `/api/v1/entries/${overlap.entryId}`,
        expect.anything(),
      ),
    );
  });
});
