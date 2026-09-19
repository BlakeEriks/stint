import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Inbox } from '@/components/inbox';
import type { Stats } from '@/lib/client/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

function stats(attention: Partial<Stats['attention']> = {}): Stats {
  return {
    currency: 'USD',
    unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
    velocity: {
      months: 3,
      total: 0,
      perMonth: 0,
      invoiced: 0,
      unbilled: 0,
      seconds: 0,
      byClient: [],
      moreClients: 0,
    },
    pace: null,
    billableRatio: null,
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

/** One unprojected entry, as `/stats` now returns it: a row, not a count. */
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
  it('is still here when there is nothing in it', () => {
    /* THE point of the change, and a deliberate reversal. The card this
       replaced rendered only when it had rows, on the `SaveIndicator`
       argument that a permanent "all clear" says nothing. That rule does not
       transfer: a save indicator is transient and inline with a form, while a
       dock region is furniture — and furniture that disappears leaves the
       user wondering where it went. */
    render(<Inbox stats={stats()} />, { wrapper });

    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByText(/nothing needs you/i)).toBeInTheDocument();
  });

  /**
   * The count slot and the sentence below it stated the same fact a few pixels
   * apart. "clear" also reads as a verb before it resolves to an adjective.
   */
  it('leaves the count empty rather than saying "clear" beside "Nothing needs you"', () => {
    render(<Inbox stats={stats()} />, { wrapper });

    expect(screen.queryByText(/^clear$/i)).not.toBeInTheDocument();
  });

  it('says how many things want a decision', () => {
    render(
      <Inbox
        stats={stats({
          overdueInvoices: [overdue],
          unprojected: [unprojectedEntry],
        })}
      />,
      { wrapper },
    );

    /* A number that is sometimes zero says more than a dot that is sometimes
       lit, so the count is the whole status — no badge colour. */
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText(/nothing needs you/i)).toBeNull();
  });

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

  it('keeps the actions in the document when the row is not hovered', () => {
    render(<Inbox stats={stats({ overdueInvoices: [overdue] })} />, {
      wrapper,
    });

    /* The reveal is opacity, never `display:none` — a slot that leaves the
       flow regrows the row the moment a pointer crosses it. jsdom cannot see
       Tailwind's opacity, but it CAN see the element leaving the tree, which
       is the regression worth pinning. */
    expect(
      screen.getByRole('button', { name: 'Mark STINT-0001 paid' }),
    ).toBeVisible();
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

  it('never spends the accent', () => {
    const { container } = render(
      <Inbox stats={stats({ overdueInvoices: [overdue] })} />,
      { wrapper },
    );

    /* Green means the running timer, which now lives in the bar directly
       below this column. */
    const classes = [container, ...container.querySelectorAll('*')].flatMap(
      (el) => Array.from((el as HTMLElement).classList ?? []),
    );
    expect(classes.filter((c) => c.includes('accent'))).toEqual([]);
  });

  /**
   * `inbox.html`: severity is one 2px edge inside the card, and half the rows
   * have none. `danger` is the overdue invoice, where money is already late;
   * `timer-warning` is a length that wants a look; a stale draft and an
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

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('li > div'),
    );
    expect(cards).toHaveLength(4);

    const danger = cards.filter((el) =>
      el.className.includes('before:bg-danger'),
    );
    const warning = cards.filter((el) =>
      el.className.includes('before:bg-timer-warning'),
    );

    /* One of each, and they are the rows they claim to be. */
    expect(danger).toHaveLength(1);
    expect(danger[0]?.textContent).toContain('Northwind');
    expect(warning).toHaveLength(1);
    expect(warning[0]?.textContent).toContain('Migration');

    /* The other two draw no edge at all — a chore is not a fault. */
    const flagged = new Set([...danger, ...warning]);
    const plain = cards.filter((el) => !flagged.has(el));
    expect(plain).toHaveLength(2);
    for (const el of plain) {
      expect(el.className).not.toMatch(/before:bg-/);
    }
  });

  /**
   * The actions are drawn at rest. A hover-only control has nothing to sit
   * against on a raised card, and a touch device has no hover to reveal one
   * with.
   */
  it('draws the actions without hovering', () => {
    render(<Inbox stats={stats({ overdueInvoices: [overdue] })} />, {
      wrapper,
    });

    expect(
      screen.getByRole('button', { name: /mark .* paid/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Mark paid')).toBeVisible();
  });
});

/**
 * The runaway timer's row.
 *
 * `principles.md`: the app SURFACES the problem and never modifies the entry
 * itself. All three of keep / adjust / discard are the user's.
 */
describe('the runaway timer choice', () => {
  const NOW = '2026-09-11T18:00:00.000Z';

  /** A 9h timer against an 8h threshold. */
  function serveRunaway() {
    const calls: Array<{ method: string; path: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url).replace('/api/v1', '');
        const method = init?.method ?? 'GET';
        if (method !== 'GET') {
          calls.push({ method, path });
          return new Response(JSON.stringify({ id: 'e1' }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            running: {
              id: 'e1',
              taskName: 'Writing',
              projectId: null,
              startedAt: '2026-09-11T09:00:00.000Z',
              endedAt: null,
              isBillable: true,
              durationSeconds: null,
            },
            todaySeconds: 32_400,
            weekSeconds: 32_400,
            exceedsThreshold: true,
            maxTimerHours: 8,
            serverTime: NOW,
          }),
          { status: 200 },
        );
      }),
    );
    return calls;
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => vi.useRealTimers());

  it('surfaces a timer past the threshold without altering it', async () => {
    const calls = serveRunaway();
    render(<Inbox stats={stats()} />, { wrapper });

    expect(await screen.findByText(/9 hours so far/)).toBeInTheDocument();
    // Surfaced, never auto-trimmed.
    expect(calls).toHaveLength(0);
  });

  it('offers keep, adjust and discard', async () => {
    serveRunaway();
    render(<Inbox stats={stats()} />, { wrapper });

    await screen.findByText(/9 hours so far/);
    for (const name of ['Keep', 'Adjust', 'Discard']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('keeps the timer running when Keep is chosen', async () => {
    const calls = serveRunaway();
    const user = userEvent.setup();
    render(<Inbox stats={stats()} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Keep' }));

    /* A long timer is often correct. Keep must dismiss the row and touch
       nothing — stopping it here would be the app editing billable work. */
    expect(calls).toEqual([]);
    await waitFor(() => expect(screen.queryByText(/hours so far/)).toBeNull());
  });

  it('does not discard until the confirmation is clicked', async () => {
    const calls = serveRunaway();
    const user = userEvent.setup();
    render(<Inbox stats={stats()} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    /* Discarding a 16-hour entry you actually worked is not recoverable, so
       the first click only asks. */
    expect(calls).toEqual([]);
    expect(screen.getByText(/Delete it\?/)).toBeInTheDocument();
  });

  it('stops before adjusting, because a running entry has no end to edit', async () => {
    const calls = serveRunaway();
    const user = userEvent.setup();
    render(<Inbox stats={stats()} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Adjust' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/timer/stop' });
  });

  it('counts toward the inbox, so an empty one is not claimed', async () => {
    serveRunaway();
    render(<Inbox stats={stats()} />, { wrapper });

    await screen.findByText(/9 hours so far/);
    /* "Nothing needs you" while a timer has run 9 hours would be the inbox
       lying about the one thing it exists to report. */
    expect(screen.queryByText(/nothing needs you/i)).toBeNull();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('does not spend the accent, even on a row about the timer', async () => {
    serveRunaway();
    const { container } = render(<Inbox stats={stats()} />, { wrapper });
    await screen.findByText(/9 hours so far/);

    /* The sibling test renders an OVERDUE row, so it never saw this one — and
       this is the row most likely to attract green, because its subject IS
       the running timer. The accent belongs to the bar below; a second green
       here would put two meanings on one screen. */
    const classes = [container, ...container.querySelectorAll('*')].flatMap(
      (el) => Array.from((el as HTMLElement).classList ?? []),
    );
    expect(classes.filter((c) => c.includes('accent'))).toEqual([]);
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

  it('gives every entry its own row rather than a count', () => {
    serve();
    render(
      <Inbox
        stats={stats({
          unprojected: [
            unprojectedEntry,
            { ...unprojectedEntry, entryId: 'e2', taskName: 'Spec review' },
          ],
        })}
      />,
      { wrapper },
    );

    /* A row naming a number is a row the user then has to go and find. Each
       entry is a decision, so each gets a row and its own action. */
    expect(screen.getByText('Client call')).toBeInTheDocument();
    expect(screen.getByText('Spec review')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Assign a project/ }),
    ).toHaveLength(2);
  });

  it('acts in place rather than linking somewhere', () => {
    serve();
    render(<Inbox stats={withRow()} />, { wrapper });

    expect(screen.getByText('Client call').tagName).toBe('BUTTON');
    expect(screen.queryByRole('link', { name: /Client call/ })).toBeNull();
  });

  it('opens the editor on the entry, so a project can be assigned', async () => {
    serve();
    const user = userEvent.setup();
    render(<Inbox stats={withRow()} />, { wrapper });

    await user.click(screen.getByText('Client call'));

    /* The dialog is what assigns the project, and it is the same one the
       calendar and the entry list open — same validation, same write path. */
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(/Project/)).toBeInTheDocument(),
    );
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
 * A record already written, where the runaway row is a timer still running.
 * It is the only row gated by a STORED answer, because its condition never
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

  it('says which threshold it tripped, in words', () => {
    serve();
    render(<Inbox stats={stats({ strangeDurations: [longEntry] })} />, {
      wrapper,
    });

    /* Colour marks severity; it never carries the meaning alone. With both
       directions in one list, "unusual" does not say which way. */
    expect(screen.getByText(/unusually long/)).toBeInTheDocument();
  });

  it('gives a short entry its own row, never a group', () => {
    serve();
    render(
      <Inbox
        stats={stats({
          strangeDurations: [
            longEntry,
            {
              ...longEntry,
              entryId: 'e-short',
              kind: 'short' as const,
              taskName: 'Standup',
              seconds: 12,
            },
          ],
        })}
      />,
      { wrapper },
    );

    expect(screen.getByText('Migration')).toBeInTheDocument();
    expect(screen.getByText('Standup')).toBeInTheDocument();
    expect(screen.getByText(/unusually short/)).toBeInTheDocument();
  });

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

  it('the check mark belongs to "It\'s correct" alone', () => {
    serve();
    render(
      <Inbox
        stats={stats({
          overdueInvoices: [overdue],
          strangeDurations: [longEntry],
        })}
      />,
      { wrapper },
    );

    /* A single glyph on both `Keep` and `Mark paid` would mean "change
       nothing" and "record a payment" at once. Each verb gets its own. */
    const correct = screen.getByRole('button', { name: /as it is/ });
    const paid = screen.getByRole('button', { name: 'Mark STINT-0001 paid' });
    const glyph = (el: HTMLElement) =>
      el.querySelector('svg')?.getAttribute('class') ?? '';
    expect(glyph(correct)).not.toEqual('');
    expect(correct.innerHTML).not.toEqual(paid.innerHTML);
  });
});
