import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NewInvoice } from '@/components/invoice-new';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => '/invoices/new',
}));

const CLIENTS = [
  {
    id: 'c1',
    name: 'Acme Corp',
    email: null,
    address: null,
    hourlyRate: 150,
    taxRate: null,
    currency: 'USD',
    color: null,
    paymentProfileId: null,
    archivedAt: null,
  },
];

const PREVIEW = {
  clientId: 'c1',
  clientName: 'Acme Corp',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  groupingMode: 'entry' as const,
  currency: 'USD',
  lineItems: [
    {
      description: 'Design review',
      unit: 'hour' as const,
      quantity: 2.5,
      unitPrice: 150,
      rateSource: 'client' as const,
      amount: 375,
    },
  ],
  subtotal: 375,
  taxRate: 0,
  taxAmount: 0,
  total: 375,
  entryCount: 3,
  unratedEntryIds: [] as string[],
};

/** What each POST sent, newest last. */
const bodies: { path: string; body: any }[] = [];

/** Records POSTs so a test can assert generation did or did not happen. */
function serve(preview = PREVIEW) {
  const posts: string[] = [];
  bodies.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        posts.push(path);
        bodies.push({ path, body: JSON.parse(String(init?.body ?? '{}')) });
      }
      if (path.includes('/invoices/preview')) {
        return new Response(JSON.stringify(preview), { status: 200 });
      }
      if (path.includes('/clients')) {
        return new Response(JSON.stringify({ clients: CLIENTS }), {
          status: 200,
        });
      }
      if (path.endsWith('/invoices')) {
        return new Response(JSON.stringify({ id: 'inv-1' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }),
  );
  return posts;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A wrapper whose `invalidateQueries` is recorded, for the cache assertions. */
function watched() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const invalidated: string[] = [];
  const real = client.invalidateQueries.bind(client);
  client.invalidateQueries = (filters?: { queryKey?: readonly unknown[] }) => {
    invalidated.push(String(filters?.queryKey?.[0]));
    return real(filters);
  };
  return {
    invalidated,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

const chooseClient = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Client' }));
  await user.click(
    await screen.findByRole('menuitemradio', { name: 'Acme Corp' }),
  );
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('NewInvoice', () => {
  /**
   * Generation allocates a gapless number and locks entries. It must not be
   * reachable until the user has seen what it would produce.
   */
  it('does not offer generation before a preview exists', async () => {
    serve();
    render(<NewInvoice />, { wrapper });

    await screen.findByText('New invoice');
    expect(
      screen.queryByRole('button', { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the line items, and says nothing has been created', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('Design review')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing has been created yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generate/ }),
    ).toBeInTheDocument();
  });

  /**
   * The approved numbers and the generated numbers must be the same ones.
   * Changing any input after previewing has to withdraw the offer.
   */
  it('withdraws the preview when the period changes', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');

    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2026-07-01');

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Generate/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Design review')).not.toBeInTheDocument();
  });

  it('withdraws the preview when the grouping changes', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');

    await user.click(screen.getByRole('button', { name: 'Show time as' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /By task/ }),
    );

    expect(
      screen.queryByRole('button', { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });

  /** An entry with no resolvable rate would bill at zero. Block it. */
  it('blocks generation when any entry has no rate', async () => {
    serve({ ...PREVIEW, unratedEntryIds: ['e1', 'e2'] });
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(
      await screen.findByText(/2 entries have no rate/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate/ })).toBeDisabled();
  });

  it('blocks generation when the period holds nothing billable', async () => {
    serve({ ...PREVIEW, lineItems: [], subtotal: 0, total: 0, entryCount: 0 });
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText(/^Nothing to bill/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate/ })).toBeDisabled();
  });

  it('generates only when asked, and goes to the new invoice', async () => {
    const posts = serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');

    // Previewing alone must never create anything.
    expect(posts.filter((p) => p.endsWith('/invoices'))).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Generate/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/invoices/inv-1'));
  });

  /**
   * Generation marks the entries invoiced, so every view that counts unbilled
   * work is wrong the moment it returns. Invalidating only `invoices` left the
   * home cards and the calendar still offering work that had just been billed.
   */
  it('refreshes everything derived from the entries it just billed', async () => {
    serve();
    const { invalidated, wrapper: watchedWrapper } = watched();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper: watchedWrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');
    await user.click(screen.getByRole('button', { name: /Generate/ }));

    await waitFor(() => expect(invalidated).toContain('invoices'));
    for (const key of ['summary', 'entries', 'stats', 'calendar']) {
      expect(invalidated).toContain(key);
    }
  });
});

// ── expenses ───────────────────────────────────────────────────────
/* Dates far either side of any "last month" the default period picks, so
   these tests do not depend on the day they run. */
const EXPENSES = [
  {
    id: 'x1',
    clientId: 'c1',
    projectId: null,
    spentOn: '2000-01-12',
    description: 'JetBrains license',
    amount: 199,
    note: null,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
  },
  {
    id: 'x2',
    clientId: 'c1',
    projectId: null,
    spentOn: '2999-01-05',
    description: 'Next year flight',
    amount: 400,
    note: null,
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
  },
];

const WITH_EXPENSE = {
  ...PREVIEW,
  lineItems: [
    ...PREVIEW.lineItems,
    {
      description: 'JetBrains license',
      unit: 'expense' as const,
      quantity: 1,
      unitPrice: 199,
      amount: 199,
      rateSource: 'manual' as const,
      spentOn: '2000-01-12',
      expenseId: 'x1',
    },
  ],
  expensesSubtotal: 199,
  total: 574,
};

/** Serves waiting expenses too, and records every POST body. */
function serveExpenses(preview: unknown = WITH_EXPENSE) {
  const bodies: { path: string; body: any }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (init?.method === 'POST') {
        bodies.push({ path, body: JSON.parse(String(init.body ?? '{}')) });
      }
      if (path.includes('/invoices/preview')) {
        return new Response(JSON.stringify(preview), { status: 200 });
      }
      if (path.includes('/expenses')) {
        return new Response(JSON.stringify({ expenses: EXPENSES }), {
          status: 200,
        });
      }
      if (path.includes('/clients')) {
        return new Response(JSON.stringify({ clients: CLIENTS }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 200 });
    }),
  );
  return bodies;
}

describe('NewInvoice — expenses', () => {
  it('lists the client’s waiting expenses up to the period end', async () => {
    serveExpenses();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);

    expect(
      await screen.findByRole('checkbox', { name: 'Bill JetBrains license' }),
    ).toBeChecked();
    expect(screen.queryByText('Next year flight')).not.toBeInTheDocument();
  });

  it('shows expenses in their own section with their own subtotal', async () => {
    serveExpenses();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(
      await screen.findByRole('columnheader', { name: 'Expenses' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('$199.00', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('$574.00')).toBeInTheDocument();
  });

  it('leaving an expense off withdraws the preview and is sent with the next one', async () => {
    const bodies = serveExpenses();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('button', { name: /Generate/ });

    await user.click(
      screen.getByRole('checkbox', { name: 'Bill JetBrains license' }),
    );
    expect(
      screen.queryByRole('button', { name: /Generate/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('button', { name: /Generate/ });
    const last = bodies
      .filter((b) => b.path.includes('/invoices/preview'))
      .at(-1);
    expect(last?.body.excludedExpenseIds).toEqual(['x1']);
  });

  it('describes charges as fees, never as expenses passed on', async () => {
    serveExpenses();
    render(<NewInvoice />, { wrapper });
    expect(
      await screen.findByText('A fixed fee, a deposit, or a retainer.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/expense you are passing on/)).toBeNull();
  });
});

describe('NewInvoice — one summary line', () => {
  const pickSummary = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Show time as' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /One summary line/ }),
    );
  };

  it('offers One summary line first under "Show time as"', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Show time as' }),
    );
    const options = await screen.findAllByRole('menuitemradio');
    expect(options[0]).toHaveTextContent('One summary line');
    expect(options.map((o) => o.textContent)).toHaveLength(5);
  });

  it('asks for the line text, empty to start, and blocks generation without it', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await pickSummary(user);

    const field = screen.getByLabelText(/Summary line/);
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Give the summary line its text.',
    );

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');
    expect(screen.getByRole('button', { name: /Generate/ })).toBeDisabled();
  });

  it('sends the text with the preview and the invoice', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await pickSummary(user);
    await user.type(
      screen.getByLabelText(/Summary line/),
      'Software consulting services',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');
    await user.click(screen.getByRole('button', { name: /Generate/ }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    for (const path of ['/invoices/preview', '/invoices']) {
      const sent = bodies.find((b) => b.path.endsWith(path))!.body;
      expect(sent.groupingMode).toBe('summary');
      expect(sent.summaryText).toBe('Software consulting services');
    }
  });
});

describe('NewInvoice — supporting detail', () => {
  it('offers Attach only with One summary line, all unticked', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await screen.findByText('New invoice');
    expect(screen.queryByText('Attach')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show time as' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /One summary line/ }),
    );
    for (const name of ['Hours by project', 'Hours by week', 'Hours by date'])
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
  });

  it('sends the ticked schedules in print order, and keeps the preview', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Show time as' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /One summary line/ }),
    );
    await user.type(screen.getByLabelText(/Summary line/), 'Services');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');

    await user.click(screen.getByRole('checkbox', { name: 'Hours by date' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Hours by project' }),
    );
    // Ticking changes no line, so the approved preview stands.
    await user.click(screen.getByRole('button', { name: /Generate/ }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    const sent = bodies.find((b) => b.path.endsWith('/invoices'))!.body;
    expect(sent.schedules).toEqual(['project', 'date']);
  });
});
