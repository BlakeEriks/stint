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
    pace: null,
    billableRatio: null,
    awaitingPayment: 0,
    attention: {
      overdueInvoices: [],
      staleDrafts: [],
      unprojected: null,
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

  it('says how many things want a decision', () => {
    render(
      <Inbox
        stats={stats({
          overdueInvoices: [overdue],
          unprojected: { count: 2, seconds: 5400 },
        })}
      />,
      { wrapper },
    );

    /* A number that is sometimes zero says more than a dot that is sometimes
       lit, so the count is the whole status — no badge colour. */
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText(/nothing needs you/i)).toBeNull();
  });

  it('names the invoice in every action, not just the icon', () => {
    render(<Inbox stats={stats({ overdueInvoices: [overdue] })} />, {
      wrapper,
    });

    /* Labels do not fit at 280px, so the actions are icon-only and the
       accessible name is all a screen reader gets. A column of identical
       "Download" buttons would be unusable. */
    expect(
      screen.getByRole('button', { name: 'Mark STINT-0001 paid' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Download STINT-0001' }),
    ).toBeInTheDocument();
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
});

/**
 * The runaway timer's row.
 *
 * These moved here from `timer-bar.test.tsx` with the control itself. The
 * notice used to render inside the timer bar and GREW it, pushing the frame
 * down at the moment a problem appeared; the inbox is where things wanting a
 * decision live, and it does not reflow.
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
    expect(screen.queryByText(/hours so far/)).toBeNull();
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
