import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { localDateKey } from '@stint/core';
import { NewInvoice } from '@/components/invoice-new';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => '/invoices/new',
}));

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const CLIENTS = [
  {
    id: 'c1',
    name: 'Acme Corp',
    email: 'ap@acme.test',
    address: '1 Main St',
    hourlyRate: 150,
    taxRate: null,
    currency: 'USD',
    color: null,
    paymentProfileId: null,
    archivedAt: null,
  },
];

const SETTINGS = {
  businessName: 'Blake Eriks',
  businessAddress: '1200 Pine St',
  businessEmail: 'blake@example.test',
  invoiceNumberPrefix: 'STINT-',
  nextInvoiceNumber: 16,
  defaultPaymentTerms: 'Net 30',
};

const PROFILES = [
  {
    id: 'pp1',
    name: 'Business checking',
    isDefault: true,
    accountHolderName: 'Blake Eriks',
    bankName: 'First Federal',
    accountNumber: '000123456789',
    routingNumber: '021000021',
    accountType: 'checking',
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
      entryIds: [],
    },
  ],
  subtotal: 375,
  taxRate: 0,
  taxAmount: 0,
  expensesSubtotal: 0,
  total: 375,
  entryCount: 3,
  unratedEntryIds: [] as string[],
  schedules: {
    project: [{ project: 'Portal', hours: 2.5 }],
    week: [{ start: '2026-08-03', end: '2026-08-09', hours: 2.5 }],
    date: [{ date: '2026-08-04', project: 'Portal', hours: 2.5 }],
    totalHours: 2.5,
  },
};

/* Dates far either side of any "last month" the default period picks, so
   these tests do not depend on the day they run. */
const EXPENSES = [
  {
    id: 'x1',
    clientId: 'c1',
    recurring: false,
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
    recurring: false,
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
      entryIds: [],
      spentOn: '2000-01-12',
      expenseId: 'x1',
    },
  ],
  expensesSubtotal: 199,
  total: 574,
};

/** What each POST sent, oldest first. */
let bodies: { path: string; body: any }[] = [];
/** Held previews: a test releases one to watch the card settle. */
let hold: Promise<void> | null = null;

function serve(preview: unknown = PREVIEW) {
  bodies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (init?.method === 'POST') {
        bodies.push({ path, body: JSON.parse(String(init.body ?? '{}')) });
      }
      const ok = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200 });
      if (path.includes('/invoices/preview')) {
        if (hold) await hold;
        return ok(preview);
      }
      if (path.endsWith('/invoices')) return ok({ id: 'inv-1' });
      if (path.includes('/expenses')) return ok({ expenses: EXPENSES });
      if (path.includes('/clients')) return ok({ clients: CLIENTS });
      if (path.includes('/settings')) return ok(SETTINGS);
      if (path.includes('/payment-profiles'))
        return ok({ paymentProfiles: PROFILES });
      return ok({});
    }),
  );
}

const previews = () => bodies.filter((b) => b.path.includes('/preview'));

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

type User = ReturnType<typeof userEvent.setup>;

const chooseClient = async (user: User) => {
  await user.click(await screen.findByRole('button', { name: 'Client' }));
  await user.click(
    await screen.findByRole('menuitemradio', { name: 'Acme Corp' }),
  );
};

const pickGrouping = async (user: User, name: RegExp) => {
  await user.click(screen.getByRole('button', { name: 'Show time as' }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
};

const card = () => screen.getByRole('region', { name: 'Preview' });
const generate = () => screen.getByRole('button', { name: /Generate/ });

/** Chosen and settled: the card shows its answer and nothing is pending. */
const ready = async (user: User) => {
  await chooseClient(user);
  await within(card()).findByText('Design review');
  await waitFor(() => expect(generate()).toBeEnabled());
};

beforeEach(() => {
  vi.clearAllMocks();
  hold = null;
});
afterEach(() => vi.unstubAllGlobals());

describe('NewInvoice', () => {
  it('holds Generate until a client is chosen', async () => {
    serve();
    render(<NewInvoice />, { wrapper });

    expect(await screen.findByText('New invoice')).toBeInTheDocument();
    expect(generate()).toBeDisabled();
    expect(
      screen.getByText('Choose a client to see what this invoice will say.'),
    ).toBeInTheDocument();
  });

  it('previews as the form fills, with no Preview button', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await ready(user);
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.getByText('3 entries')).toBeInTheDocument();
    expect(previews()).toHaveLength(1);
  });

  it('shows the invoice as the PDF prints it', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    const c = within(card());
    expect(c.getByText('Blake Eriks', { selector: 'b' })).toBeInTheDocument();
    expect(c.getByText('No.').nextElementSibling).toHaveTextContent(
      'STINT-0016',
    );
    expect(c.getByText('Issued')).toBeInTheDocument();
    expect(c.getByText('Bill to')).toBeInTheDocument();
    expect(c.getByText('Acme Corp')).toBeInTheDocument();
    expect(c.getByText('Service period')).toBeInTheDocument();
    expect(c.getByText('Amount due')).toBeInTheDocument();
    expect(c.getByText('First Federal')).toBeInTheDocument();
    expect(c.getByText(/locks these entries/)).toBeInTheDocument();
  });

  it('says Updating and holds Generate while the server recomputes', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    let release = () => {};
    hold = new Promise((r) => {
      release = r;
    });
    await pickGrouping(user, /By task/);

    expect(screen.getByText('Updating…')).toBeInTheDocument();
    expect(generate()).toBeDisabled();

    release();
    await waitFor(() => expect(generate()).toBeEnabled());
    expect(screen.queryByText('Updating…')).toBeNull();
    expect(previews().at(-1)?.body.groupingMode).toBe('task');
  });

  it('shows a ticked schedule at once, with no request', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await chooseClient(user);
    await pickGrouping(user, /One summary line/);
    await user.type(screen.getByLabelText(/Summary line/), 'Services');
    await waitFor(() => expect(generate()).toBeEnabled());
    const sent = previews().length;

    await user.click(
      screen.getByRole('checkbox', { name: 'Hours by project' }),
    );

    expect(
      within(card()).getByText('Page 2 · supporting detail'),
    ).toBeInTheDocument();
    expect(within(card()).getByText('Portal')).toBeInTheDocument();
    expect(previews()).toHaveLength(sent);
    expect(generate()).toBeEnabled();
  });

  it('blocks generation when any entry has no rate', async () => {
    serve({ ...PREVIEW, unratedEntryIds: ['e1', 'e2'] });
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await chooseClient(user);

    expect(
      await screen.findByText(/2 entries have no rate/),
    ).toBeInTheDocument();
    expect(generate()).toBeDisabled();
  });

  it('blocks generation when the period holds nothing billable', async () => {
    serve({ ...PREVIEW, lineItems: [], subtotal: 0, total: 0, entryCount: 0 });
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await chooseClient(user);

    expect(await screen.findByText(/^Nothing to bill/)).toBeInTheDocument();
    expect(generate()).toBeDisabled();
  });

  it('generates only when pressed, dated today where the user is', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);
    expect(bodies.filter((b) => b.path.endsWith('/invoices'))).toHaveLength(0);

    await user.click(generate());

    await waitFor(() => expect(push).toHaveBeenCalledWith('/invoices/inv-1'));
    const sent = bodies.find((b) => b.path.endsWith('/invoices'))!.body;
    expect(sent.issueDate).toBe(localDateKey(new Date(), tz));
  });

  it('asks for no notes', async () => {
    serve();
    render(<NewInvoice />, { wrapper });
    await screen.findByText('New invoice');
    expect(screen.queryByLabelText('Notes')).toBeNull();
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

    await ready(user);
    await user.click(generate());

    await waitFor(() => expect(invalidated).toContain('invoices'));
    for (const key of ['summary', 'entries', 'stats', 'calendar']) {
      expect(invalidated).toContain(key);
    }
  });
});

describe('NewInvoice — expenses', () => {
  it('lists the client’s waiting expenses up to the period end', async () => {
    serve(WITH_EXPENSE);
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);

    expect(
      await screen.findByRole('checkbox', { name: 'Bill JetBrains license' }),
    ).toBeChecked();
    expect(screen.queryByText('Next year flight')).not.toBeInTheDocument();
  });

  it('shows expenses in their own section with their own subtotal', async () => {
    serve(WITH_EXPENSE);
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await chooseClient(user);

    const c = within(card());
    expect(
      await c.findByRole('columnheader', { name: 'Expenses' }),
    ).toBeInTheDocument();
    expect(c.getByText('Services')).toBeInTheDocument();
    expect(c.getByText('$574.00')).toBeInTheDocument();
  });

  it('leaving an expense off asks the server again', async () => {
    serve(WITH_EXPENSE);
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    await user.click(
      screen.getByRole('checkbox', { name: 'Bill JetBrains license' }),
    );

    await waitFor(() =>
      expect(previews().at(-1)?.body.excludedExpenseIds).toEqual(['x1']),
    );
  });
});

describe('NewInvoice — one summary line', () => {
  it('offers One summary line first under "Show time as"', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Show time as' }),
    );
    const options = await screen.findAllByRole('menuitemradio');
    expect(options[0]).toHaveTextContent('One summary line');
    expect(options).toHaveLength(5);
  });

  it('asks for the line text, empty to start, and blocks generation without it', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await ready(user);
    await pickGrouping(user, /One summary line/);

    const field = screen.getByLabelText(/Summary line/);
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Give the summary line its text.')).toHaveAttribute(
      'role',
      'alert',
    );
    await waitFor(() => expect(previews().length).toBeGreaterThan(1));
    expect(generate()).toBeDisabled();
  });

  it('sends the text with the preview and the invoice', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await pickGrouping(user, /One summary line/);
    await user.type(
      screen.getByLabelText(/Summary line/),
      'Software consulting services',
    );
    await waitFor(() => expect(generate()).toBeEnabled());
    await user.click(generate());
    await waitFor(() => expect(push).toHaveBeenCalled());

    for (const sent of [
      previews().at(-1)!.body,
      bodies.find((b) => b.path.endsWith('/invoices'))!.body,
    ]) {
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

    await pickGrouping(user, /One summary line/);
    for (const name of ['Hours by project', 'Hours by week', 'Hours by date'])
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
  });

  it('sends the ticked schedules in print order', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await pickGrouping(user, /One summary line/);
    await user.type(screen.getByLabelText(/Summary line/), 'Services');
    await user.click(screen.getByRole('checkbox', { name: 'Hours by date' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Hours by project' }),
    );
    await waitFor(() => expect(generate()).toBeEnabled());
    await user.click(generate());
    await waitFor(() => expect(push).toHaveBeenCalled());

    const sent = bodies.find((b) => b.path.endsWith('/invoices'))!.body;
    expect(sent.schedules).toEqual(['project', 'date']);
  });
});

describe('NewInvoice — reference', () => {
  it('shows the reference in the card at once, and sends it', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);
    const sent = previews().length;

    const field = screen.getByLabelText('Reference');
    expect(field).toHaveAttribute('placeholder', 'PO number, contract or SOW');
    expect(within(card()).queryByText('Reference')).toBeNull();
    await user.type(field, 'PO 4471');

    expect(within(card()).getByText('PO 4471')).toBeInTheDocument();
    expect(previews()).toHaveLength(sent);

    await user.click(generate());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(
      bodies.find((b) => b.path.endsWith('/invoices'))!.body.reference,
    ).toBe('PO 4471');
  });
});
