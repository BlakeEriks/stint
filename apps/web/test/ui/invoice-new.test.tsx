import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { addDays, localDateKey } from '@stint/core';
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
  businessName: 'Sam Rivera',
  businessAddress: '1200 Pine St',
  businessEmail: 'sam@example.test',
  invoiceNumberPrefix: 'STINT-',
  nextInvoiceNumber: 16,
  defaultPaymentTerms: 'Net 30',
};

/** The settings served; a test changes the payment terms. */
let settings = SETTINGS;

let PROFILES = [
  {
    id: 'pp1',
    name: 'Business checking',
    isDefault: true,
    accountHolderName: 'Sam Rivera',
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
  overlappingEntryIds: [] as string[],
  schedules: {
    project: [{ project: 'Portal', hours: 2.5 }],
    week: [{ start: '2026-08-03', end: '2026-08-09', hours: 2.5 }],
    date: [{ date: '2026-08-04', project: 'Portal', hours: 2.5 }],
    totalHours: 2.5,
  },
};

/* Dates far either side of any month the default period picks, so
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

/** The client's invoices, newest first, as the list serves them. */
let invoices: unknown[] = [];
/** A held invoice list: a test answers it after the form has settled. */
let holdInvoices: Promise<void> | null = null;

/** What each POST sent, oldest first. */
let bodies: { path: string; body: any }[] = [];
/** Held previews: a test releases one to watch the card settle. */
let hold: Promise<void> | null = null;
/** Held settings: a test keeps Due unknown. */
let holdSettings: Promise<void> | null = null;
/** Held payment-profile lists: a test stops the refetch after a save. */
let holdProfiles: Promise<void> | null = null;

const DEFAULT_PROFILES = PROFILES;

function serve(preview: unknown = PREVIEW) {
  bodies = [];
  holdProfiles = null;
  PROFILES = [...DEFAULT_PROFILES];
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
      if (path.includes('/invoices?')) {
        if (holdInvoices) await holdInvoices;
        return ok({ invoices });
      }
      if (path.endsWith('/invoices')) return ok({ id: 'inv-1' });
      if (path.includes('/expenses')) return ok({ expenses: EXPENSES });
      if (path.includes('/clients')) return ok({ clients: CLIENTS });
      if (path.includes('/settings')) {
        if (holdSettings) await holdSettings;
        return ok(settings);
      }
      if (path.includes('/payment-profiles')) {
        if (init?.method === 'POST') {
          const made = { ...JSON.parse(String(init.body)), id: 'pp2' };
          PROFILES.push(made);
          return ok(made);
        }
        if (holdProfiles) await holdProfiles;
        return ok({ paymentProfiles: PROFILES });
      }
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
  settings = SETTINGS;
  holdSettings = null;
  invoices = [];
  holdInvoices = null;
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

  it('says why a recompute failed, and holds Generate', async () => {
    serve();
    const served = globalThis.fetch;
    let fail = false;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
      fail && String(url).includes('/invoices/preview')
        ? new Response(
            JSON.stringify({ code: 'INVALID', message: 'Period ends first.' }),
            { status: 400 },
          )
        : served(url, init),
    );
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    fail = true;
    await pickGrouping(user, /By task/);

    expect(await screen.findByText('Period ends first.')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(generate()).toBeDisabled();
  });

  it('defaults Due to the payment terms, and sends the date it shows', async () => {
    serve();
    settings = { ...SETTINGS, defaultPaymentTerms: 'Net 15' };
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    const due = addDays(localDateKey(new Date(), tz), 15);
    await waitFor(() => expect(screen.getByLabelText('Due')).toHaveValue(due));
    await ready(user);

    await user.click(generate());

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(bodies.find((b) => b.path.endsWith('/invoices'))!.body.dueDate).toBe(
      due,
    );
  });

  /* The form paints once, with its terms in place, so Generate is
     never there to press before Due can be filled. */
  it('holds the form until the settings answer, so Due is never sent blank', async () => {
    serve();
    let release = () => {};
    holdSettings = new Promise((r) => {
      release = r;
    });
    render(<NewInvoice />, { wrapper });
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByRole('button', { name: /generate/i })).toBeNull();

    release();

    expect(
      await screen.findByRole('button', { name: /generate/i }),
    ).toBeInTheDocument();
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
});

describe('NewInvoice — one summary line', () => {
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

  it('takes spaces alone as no text', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await ready(user);
    await pickGrouping(user, /One summary line/);
    await user.type(screen.getByLabelText(/Summary line/), '   ');

    expect(
      screen.getByText('Give the summary line its text.'),
    ).toBeInTheDocument();
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

describe('NewInvoice — from the client’s last invoice', () => {
  const sent = (summaryText: string | null, status = 'sent') => ({
    id: `inv-${summaryText}`,
    clientId: 'c1',
    status,
    groupingMode: summaryText === null ? 'entry' : 'summary',
    summaryText,
    supportingDetail:
      summaryText === null
        ? null
        : { week: PREVIEW.schedules.week, totalHours: 2.5 },
  });

  it('opens with the last summary’s text and attachments, still editable', async () => {
    invoices = [sent('Voided', 'void'), sent('Consulting'), sent(null)];
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    const field = await screen.findByLabelText(/Summary line/);
    expect(field).toHaveValue('Consulting');
    expect(
      screen.getByRole('button', { name: 'Show time as' }),
    ).toHaveTextContent('One summary line');
    expect(
      screen.getByRole('checkbox', { name: 'Hours by week' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Hours by project' }),
    ).not.toBeChecked();

    await user.clear(field);
    await user.type(field, 'Consulting, October');
    await waitFor(() => expect(generate()).toBeEnabled());
    await user.click(generate());
    await waitFor(() => expect(push).toHaveBeenCalled());

    const made = bodies.find((b) => b.path.endsWith('/invoices'))!.body;
    expect(made.groupingMode).toBe('summary');
    expect(made.summaryText).toBe('Consulting, October');
    expect(made.schedules).toEqual(['week']);
    // The preview never asked before it knew the grouping.
    expect(previews().every((p) => p.body.groupingMode === 'summary')).toBe(
      true,
    );
  });

  it('asks for no preview until the last invoice answers, however late', async () => {
    invoices = [sent('Consulting')];
    let release!: () => void;
    holdInvoices = new Promise((r) => {
      release = r;
    });
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    // Past the 400ms the form takes to settle.
    await new Promise((r) => setTimeout(r, 600));
    expect(previews()).toHaveLength(0);
    expect(generate()).toBeDisabled();

    release();
    await waitFor(() => expect(generate()).toBeEnabled());
    expect(previews().length).toBeGreaterThan(0);
    expect(previews().every((p) => p.body.groupingMode === 'summary')).toBe(
      true,
    );
  });

  it('opens every entry when the last invoice was not a summary', async () => {
    invoices = [sent(null)];
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await ready(user);
    expect(
      screen.getByRole('button', { name: 'Show time as' }),
    ).toHaveTextContent('Every entry');
    expect(screen.queryByLabelText(/Summary line/)).toBeNull();
  });
});

describe('NewInvoice — supporting detail', () => {
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

describe('NewInvoice — expenses, charges and payment details', () => {
  it('adds a charge through its dialog, and removes it there', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    await user.click(screen.getByRole('button', { name: 'Add a charge' }));
    const dialog = await screen.findByRole('dialog', { name: 'New charge' });
    await user.type(within(dialog).getByLabelText(/Description/), 'Setup fee');
    await user.type(within(dialog).getByLabelText(/Amount/), '250');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(
      screen.getByRole('button', { name: 'Edit charge Setup fee' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(previews().at(-1)?.body.manualLines).toEqual([
        { description: 'Setup fee', amount: 250 },
      ]),
    );

    await user.click(
      screen.getByRole('button', { name: 'Edit charge Setup fee' }),
    );
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Edit charge' }),
      ).getByRole('button', { name: 'Remove' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Edit charge Setup fee' }),
    ).toBeNull();
    await waitFor(() =>
      expect(previews().at(-1)?.body.manualLines).toEqual([]),
    );
  });

  it('edits a charge in place, leaving the others', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    for (const [description, amount] of [
      ['Setup fee', '250'],
      ['Hosting', '40'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: 'Add a charge' }));
      const dialog = await screen.findByRole('dialog', { name: 'New charge' });
      await user.type(
        within(dialog).getByLabelText(/Description/),
        description,
      );
      await user.type(within(dialog).getByLabelText(/Amount/), amount);
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    }

    await user.click(
      screen.getByRole('button', { name: 'Edit charge Setup fee' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit charge' });
    const amount = within(dialog).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '300');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(previews().at(-1)?.body.manualLines).toEqual([
        { description: 'Setup fee', amount: 300 },
        { description: 'Hosting', amount: 40 },
      ]),
    );
  });

  it('holds a charge back until it has a description and an amount', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await screen.findByText('New invoice');

    await user.click(screen.getByRole('button', { name: 'Add a charge' }));
    const dialog = await screen.findByRole('dialog', { name: 'New charge' });
    await user.type(within(dialog).getByLabelText(/Description/), 'Setup fee');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('prints the default payment details, and sends the ones chosen', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    expect(
      screen.getByRole('button', { name: 'Payment details' }),
    ).toHaveTextContent('Business checking');
    await user.click(generate());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(
      bodies.find((b) => b.path.endsWith('/invoices'))!.body.paymentProfileId,
    ).toBe('pp1');
  });

  it('selects new payment details once they are saved', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    await user.click(screen.getByRole('button', { name: 'Payment details' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /New payment details/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Payment details',
    });
    await user.type(within(dialog).getByLabelText(/Label/), 'Wire');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Payment details' }),
      ).toHaveTextContent('Wire'),
    );
  });

  it('generates with new payment details before the list refetches', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });
    await ready(user);

    await user.click(screen.getByRole('button', { name: 'Payment details' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /New payment details/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Payment details',
    });
    await user.type(within(dialog).getByLabelText(/Label/), 'Wire');
    // The list's refetch after the save never lands.
    holdProfiles = new Promise(() => {});
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Payment details' }),
      ).toHaveTextContent('Wire'),
    );
    await user.click(generate());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(
      bodies.find((b) => b.path.endsWith('/invoices'))!.body.paymentProfileId,
    ).toBe('pp2');
  });
});
