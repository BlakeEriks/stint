import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Dock } from '@/components/dock';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

/**
 * `/stats` never resolves; everything else answers. Today has its own
 * `/entries` query, so it must not wait on the inbox's data.
 */
function serveAllButStats() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stats')) return new Promise<Response>(() => {});
      if (url.includes('/entries'))
        return new Response(
          JSON.stringify({
            entries: [
              {
                id: 'e1',
                taskName: 'Writing',
                projectId: null,
                startedAt: '2026-09-11T09:00:00.000Z',
                endedAt: '2026-09-11T10:00:00.000Z',
                isBillable: true,
                durationSeconds: 3600,
              },
            ],
          }),
          { status: 200 },
        );
      if (url.includes('/projects'))
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Everything answers, and Today's entry carries every field a wide row would
 * draw: a project with a client color, a non-billable badge, the lock of a
 * billed entry, and a start–end range.
 */
function serveFullRow() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      /* An empty inbox: this is about the row below it, and the Dock renders
         the Inbox as soon as stats answer at all. */
      if (url.includes('/stats'))
        return new Response(
          JSON.stringify({
            currency: 'USD',
            unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
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
            },
          }),
          { status: 200 },
        );
      if (url.includes('/entries'))
        return new Response(
          JSON.stringify({
            entries: [
              {
                id: 'e1',
                taskName: 'Writing',
                projectId: 'p1',
                startedAt: '2026-09-11T09:00:00.000Z',
                endedAt: '2026-09-11T10:00:00.000Z',
                isBillable: false,
                invoiceId: 'i1',
                durationSeconds: 3600,
              },
            ],
          }),
          { status: 200 },
        );
      if (url.includes('/projects'))
        return new Response(
          JSON.stringify({
            projects: [{ id: 'p1', name: 'Acme Redesign', clientId: 'c1' }],
          }),
          { status: 200 },
        );
      if (url.includes('/clients'))
        return new Response(
          JSON.stringify({
            clients: [{ id: 'c1', name: 'Acme', color: '#2CCCEB' }],
          }),
          { status: 200 },
        );
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

describe('Dock', () => {
  it('renders Today while /stats is still in flight', async () => {
    serveAllButStats();
    render(<Dock />, { wrapper });

    expect(await screen.findByText('Writing')).toBeInTheDocument();
    // The inbox, which does depend on stats, is correctly absent.
    expect(
      screen.queryByRole('heading', { name: 'Inbox' }),
    ).not.toBeInTheDocument();
  });

  /**
   * Today is 286px wide. Six fields wrapped to three lines there, which turns
   * a glance into a read — so the dock's row is three: swatch, task, duration.
   *
   * The project NAME goes with them; the swatch stays, because the color is
   * what the eye sorts the column by.
   */
  it('draws three fields to a row, not the wide list’s six', async () => {
    serveFullRow();
    render(<Dock />, { wrapper });

    const row = await screen.findByRole('button', { name: /Edit Writing/ });

    expect(within(row).getByText('Writing')).toBeInTheDocument();
    expect(within(row).getByText('1h')).toBeInTheDocument();

    expect(within(row).queryByText('Non-billable')).not.toBeInTheDocument();
    expect(
      within(row).queryByLabelText('Billed on an issued invoice'),
    ).not.toBeInTheDocument();
    expect(row.textContent).not.toContain(' – ');
    expect(within(row).queryByText('Acme Redesign')).not.toBeInTheDocument();
  });

  /**
   * The editor is where the four dropped fields live, so the row losing them
   * is only tolerable while the row still opens it.
   */
  it('still opens the editor from a compact row', async () => {
    serveFullRow();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Dock />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: /Edit Writing/ }),
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
