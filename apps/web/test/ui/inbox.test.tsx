import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
