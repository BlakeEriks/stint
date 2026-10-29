import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { useQuery } from '@tanstack/react-query';
import { delay, http } from 'msw';
import { api } from '@/lib/client/api';
import { handlers } from '@/mocks/handlers';
import { addDays } from '@stint/core';
import { keys } from '@stint/client';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { type Db, id } from '@/mocks/fixtures';
import { desktop, phone, screen, skipping, stalled } from '@/mocks/screen';
import { InvoiceDetail } from './invoice-detail';

/* Each status offers its own actions: a draft is deleted or sent, an issued
   invoice voided, and Download is there in every status. */
const invoice = (seq: number) => id(300 + seq);

/* A paying account, so every story but the locked ones shows the document.
   The seeded account is free with billing set up. */
const paying = (edit: (db: Db) => void = () => {}) =>
  account((db) => {
    db.billing = { ...db.billing, plan: 'paid', status: 'active' };
    edit(db);
  });

const route = screen(`/invoices/${invoice(15)}`);
const meta = {
  title: 'Screens/Invoices/Detail',
  component: InvoiceDetail,
  ...route,
  parameters: { ...route.parameters, ...paying() },
  args: { id: invoice(15) },
} satisfies Meta<typeof InvoiceDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Lines and total; no supporting detail named. The
    actions share the title's row, whatever the length of the status line. */
export const Draft: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText('Type scale for the brand site'),
    ).toBeVisible();
    const title = page
      .getByRole('heading', { level: 1 })
      .getBoundingClientRect();
    const download = page
      .getByRole('link', { name: 'Download PDF' })
      .getBoundingClientRect();
    await expect(download.top).toBeLessThan(title.bottom);
    await expect(
      page.getByText('Amount due').nextElementSibling,
    ).toHaveTextContent('$2,787.60');
    await expect(page.queryByText(/supporting detail/)).toBeNull();
  },
};
export const DraftPhone: Story = { ...phone };

/* The `invoice` handler with one invoice answering only once `wait`
   settles. The rest answer at once: the dock's Inbox prefetches them. */
const waitingOn = (which: string, wait: () => Promise<unknown>) => ({
  invoice: http.get(handlers.invoice.info.path, async (info) => {
    if (info.params.id === which) await wait();
    const answer = await handlers.invoice.run({
      request: info.request,
      requestId: info.requestId,
    });
    return answer?.response;
  }),
});

/** As `stalled('invoice')`, for this invoice only. */
const stalledOn = (which: string) => ({
  stalls: 1,
  msw: { handlers: waitingOn(which, () => delay('infinite')) },
});

/* The invoice answers only when the play says, so it can measure the
   actions before and after. */
let arrive = () => {};
const held = {
  msw: {
    handlers: waitingOn(
      invoice(15),
      () =>
        new Promise<void>((done) => {
          arrive = done;
        }),
    ),
  },
};

/** A cold load where the row wraps: the title arriving beside the actions
    moves nothing. */
export const ColdLoadPhone: Story = {
  ...phone,
  parameters: held,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const top = () =>
      page.getByRole('button', { name: 'Delete draft' }).getBoundingClientRect()
        .top;
    await page.findByRole('button', { name: 'Delete draft' });
    const before = top();
    arrive();
    await page.findByRole('link', { name: 'Download PDF' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(top()).toBe(before);
  },
};

/* The draft as the server sends it once work landed after its PDF. */
const changed = paying((db) => {
  const draft = db.invoices.find((i) => i.id === invoice(15));
  if (!draft) return;
  draft.changedSinceDownload = {
    hours: { from: 18.4, to: 20.9 },
    total: { from: 2512.6, to: 2787.6 },
  };
  const line = draft.lineItems[0];
  if (line) line.isNew = true;
});

/** Work landed after the PDF was downloaded: the banner says what moved,
    Mark sent waits for the new PDF, and the new line is tinted. */
export const DraftChanged: Story = {
  ...desktop,
  parameters: changed,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText('Changed since you downloaded it'),
    ).toBeVisible();
    await expect(page.getByText(/2\.50h added/)).toBeVisible();
    await expect(page.getByText('$2,512.60')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mark sent' }),
    ).toBeDisabled();
    await expect(
      page.getByText('Type scale for the brand site').closest('tr'),
    ).toHaveClass(/bg-warning-muted/);
  },
};
export const DraftChangedPhone: Story = { ...phone, parameters: changed };

/* The draft as the server sends it with work no rate prices. */
const unrated = paying((db) => {
  const draft = db.invoices.find((i) => i.id === invoice(15));
  if (!draft) return;
  draft.unratedEntries = [
    {
      id: id(9001),
      taskName: 'Onboarding call',
      startedAt: '2026-09-08T15:00:00.000Z',
    },
  ];
});

/** Work with no rate shows on the draft by name, and neither the PDF nor
    Mark sent opens until it has one. */
export const DraftUnrated: Story = {
  ...desktop,
  parameters: unrated,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText('1 entry has no rate')).toBeVisible();
    await expect(page.getByText(/Onboarding call · Sep 8/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mark sent' }),
    ).toBeDisabled();
    await expect(page.queryByRole('link', { name: 'Download PDF' })).toBeNull();
    await expect(
      page.getByRole('button', { name: 'Download PDF' }),
    ).toBeDisabled();
  },
};

const dueBefore = paying((db) => {
  const draft = db.invoices.find((i) => i.id === invoice(15));
  if (!draft) return;
  draft.dueDate = addDays(draft.issueDate, -3);
});

/** A typed due date the issue date has passed says why and how to fix it,
    and neither the PDF nor Mark sent is offered. */
export const DraftDueBeforeIssue: Story = {
  ...desktop,
  parameters: dueBefore,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText('Due before it’s issued')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mark sent' }),
    ).toBeDisabled();
    await expect(page.queryByRole('link', { name: 'Download PDF' })).toBeNull();
  },
};

const dueSinceDownload = paying((db) => {
  const draft = db.invoices.find((i) => i.id === invoice(15));
  if (!draft) return;
  draft.dueDate = addDays(draft.issueDate, -3);
  draft.dueBeforeIssue = { download: true, send: false };
});

/** Downloaded before its typed due date: that PDF still sends, and only a
    new one is refused. */
export const DraftDueSinceDownload: Story = {
  ...desktop,
  parameters: dueSinceDownload,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText(/Send the PDF you downloaded/),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark sent' })).toBeEnabled();
    await expect(page.queryByRole('link', { name: 'Download PDF' })).toBeNull();
  },
};

const changedPastDue = paying((db) => {
  const draft = db.invoices.find((i) => i.id === invoice(15));
  if (!draft) return;
  draft.dueDate = addDays(draft.issueDate, -3);
  draft.changedSinceDownload = {
    hours: { from: 18.4, to: 20.9 },
    total: { from: 2512.6, to: 2787.6 },
  };
  draft.dueBeforeIssue = { download: true, send: true };
});

/** Changed since a PDF downloaded before its typed due date: the new PDF it
    needs is refused, so it asks for a new draft, not a download. */
export const DraftChangedPastDue: Story = {
  ...desktop,
  parameters: changedPastDue,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText(/Delete this draft and generate it again/),
    ).toBeVisible();
    await expect(
      page.queryByText('Changed since you downloaded it'),
    ).toBeNull();
    await expect(page.queryByText(/Download the new PDF/)).toBeNull();
    await expect(
      page.getByRole('button', { name: 'Mark sent' }),
    ).toBeDisabled();
  },
};

/** No line under the title: the card already shows the due date. An
    issued invoice is the invoice, not a preview of it. */
export const Sent: Story = {
  ...desktop,
  args: { id: invoice(14) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText('Bill to')).toBeVisible();
    await expect(page.queryByText(/^Due \w/)).toBeNull();
    await expect(page.queryByRole('heading', { name: 'Status' })).toBeNull();
    await expect(page.queryByRole('heading', { name: 'Preview' })).toBeNull();
  },
};
export const Overdue: Story = { ...desktop, args: { id: invoice(13) } };
export const Paid: Story = { ...desktop, args: { id: invoice(12) } };
/** Voiding keeps the number and releases the entries. */
export const Void: Story = {
  ...desktop,
  args: { id: invoice(9) },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Its entries can be billed again/),
    ).toBeVisible();
  },
};
export const Missing: Story = { ...desktop, args: { id: invoice(99) } };

/** Free, with billing set up: the document is the paid tier. The invoice
    still shows in full; Download gives way to subscribing, and the page says
    the records stay free. */
export const Locked: Story = {
  ...desktop,
  parameters: account('seeded'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const subscribe = await page.findByRole('link', {
      name: 'Subscribe to download',
    });
    await expect(subscribe).toHaveAttribute('href', '/settings#plan');
    await expect(page.getByText(/on the paid plan, \$40 a year/)).toBeVisible();
    await expect(page.getByText(/exporting them included/)).toBeVisible();
    await expect(page.queryByRole('link', { name: /Download PDF/ })).toBeNull();
    await expect(page.getByText('Amount due')).toBeVisible();
  },
};
export const LockedPhone: Story = { ...phone, parameters: account('seeded') };

/** Billing not set up: nothing is gated, as before billing existed. */
export const BillingNotSetUp: Story = {
  ...desktop,
  parameters: account((db) => {
    db.billing = { ...db.billing, available: false };
  }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('link', { name: /Download PDF/ }),
    ).toBeVisible();
  },
};

/** The first press of a destructive pair only asks; the second names it. */
const press =
  (first: string, then?: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const page = within(canvasElement);
    // Each action is on screen at once, and pressable once the invoice is.
    const button = await page.findByRole('button', { name: first });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    if (then) await userEvent.click(page.getByRole('button', { name: then }));
  };

export const ConfirmDelete: Story = {
  ...desktop,
  play: async (ctx) => {
    await press('Delete draft')(ctx);
    await expect(
      within(ctx.canvasElement).getByRole('button', {
        name: 'Delete STINT-0015 for good',
      }),
    ).toBeVisible();
  },
};

export const Deleting: Story = {
  ...desktop,
  parameters: stalled('deleteInvoice'),
  play: async (ctx) => {
    await press('Delete draft', 'Delete STINT-0015 for good')(ctx);
    await expect(
      await within(ctx.canvasElement).findByRole('button', {
        name: 'Deleting…',
      }),
    ).toBeDisabled();
  },
};

export const ConfirmVoid: Story = {
  ...desktop,
  args: { id: invoice(14) },
  play: async (ctx) => {
    await press('Void')(ctx);
    await expect(
      within(ctx.canvasElement).getByRole('button', {
        name: 'Void STINT-0014',
      }),
    ).toBeVisible();
  },
};

export const Voiding: Story = {
  ...desktop,
  args: { id: invoice(14) },
  parameters: stalled('updateInvoiceStatus'),
  play: async (ctx) => {
    await press('Void', 'Void STINT-0014')(ctx);
    await expect(
      await within(ctx.canvasElement).findByRole('button', {
        name: 'Voiding…',
      }),
    ).toBeDisabled();
  },
};

/** A fixed charge prints as 1 x its amount, so its row checks like the rest. */
export const WithCharge: Story = {
  ...desktop,
  parameters: paying((db) => {
    const draft = db.invoices.find((i) => i.id === invoice(15));
    if (!draft) return;
    draft.lineItems.push({
      description: 'Hosting, August',
      unit: 'fixed',
      quantity: 1,
      unitPrice: 400,
      amount: 400,
      spentOn: null,
    });
    draft.subtotal += 400;
    draft.total += 400;
  }),
};

/** Expenses print after the services with their own subtotal. */
export const WithExpenses: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText('Stock photography')).toBeVisible();
    await expect(page.getAllByText('Expenses').length).toBeGreaterThan(0);
  },
};

/** The reference it was issued with, under the service period. */
export const WithReference: Story = {
  ...desktop,
  args: { id: invoice(14) },
  parameters: paying((db) => {
    const sent = db.invoices.find((i) => i.id === invoice(14));
    if (sent) sent.reference = 'PO 4471';
  }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('PO 4471'),
    ).toBeVisible();
  },
};

/** A summary invoice shows the detail it carries from page 2 (US2
    scenario 8). */
export const WithSupportingDetail: Story = {
  ...desktop,
  parameters: paying((db) => {
    const draft = db.invoices.find((i) => i.id === invoice(15));
    if (!draft) return;
    draft.groupingMode = 'summary';
    draft.summaryText = 'Software consulting services';
    draft.supportingDetail = {
      project: [{ project: 'Warehouse dashboard', hours: 12 }],
      week: [{ start: '2026-08-03', end: '2026-08-09', hours: 12 }],
      totalHours: 12,
    };
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText('Page 2 · supporting detail'),
    ).toBeVisible();
    await expect(page.getByText('Hours by project')).toBeVisible();
    await expect(page.getByText('Hours by week')).toBeVisible();
  },
};

/** Every line the PDF prints: the terms, the whole payment block, and the
    notes. */
export const AsPrinted: Story = {
  ...desktop,
  args: { id: invoice(14) },
  parameters: paying((db) => {
    const sent = db.invoices.find((i) => i.id === invoice(14));
    if (!sent) return;
    sent.notes = 'Thank you for the work this month.';
    sent.paymentDetails = {
      fields: [
        { label: 'Account holder', value: 'Sam Rivera' },
        { label: 'Routing number (ACH)', value: '021000021' },
      ],
      intermediary: [],
      link: { label: 'Pay online', url: 'https://pay.example.test/sam' },
      notes: 'Include the invoice number in the memo.',
    };
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    for (const text of [
      'Net 30',
      'Payment details',
      'Pay online: https://pay.example.test/sam',
      'Include the invoice number in the memo.',
      'Thank you for the work this month.',
    ]) {
      await expect(await page.findByText(text)).toBeVisible();
    }
  },
};

/* Mounts the page only once the lists it was opened from are cached, as
   they are after a click in Invoices. */
const fromTheList: Decorator = (Story) => {
  const invoices = useQuery({
    queryKey: keys.invoices(),
    queryFn: () => api.invoices(),
  });
  const clients = useQuery({
    queryKey: keys.clients({ archived: true }),
    queryFn: () => api.clients({ includeArchived: true }),
  });
  return invoices.data && clients.data ? <Story /> : <></>;
};

/** Opened from the list: the invoice draws from what the list holds, and
    the card says it is updating until its lines arrive. */
export const OpenedFromList: Story = {
  ...desktop,
  args: { id: invoice(14) },
  decorators: [fromTheList],
  parameters: {
    ...stalledOn(invoice(14)),
    /* The card dims until its lines land; axe reads the half opacity as low
       contrast. */
    a11y: skipping('color-contrast'),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByRole('heading', { name: 'STINT-0014' }),
    ).toBeVisible();
    await expect(page.getByText('Updating…')).toBeVisible();
    await expect(page.queryByText('Loading…')).toBeNull();
    await expect(page.queryByText('Amount due')).toBeNull();
    /* The row's status picks the actions; they wait, disabled, for the
       invoice, which alone says whether the PDF opens. */
    await expectWaiting(page, ['Void', 'Mark paid', 'Download PDF']);
    await expect(page.queryByRole('link', { name: /Subscribe/ })).toBeNull();
  },
};

/** Each action is on screen and disabled, and nothing links yet. */
async function expectWaiting(page: ReturnType<typeof within>, names: string[]) {
  for (const name of names) {
    await expect(page.getByRole('button', { name })).toBeDisabled();
  }
  await expect(page.queryByRole('link', { name: /Download PDF/ })).toBeNull();
}

/** On its way from a pasted link: one quiet word where it will be, under a
    draft's actions, disabled, since the status isn't known yet. */
export const Loading: Story = {
  ...desktop,
  parameters: stalledOn(invoice(15)),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement.querySelector('main') as HTMLElement);
    await expect(await region.findByRole('status')).toHaveTextContent(
      'Loading',
    );
    await expectWaiting(region, ['Delete draft', 'Mark sent', 'Download PDF']);
  },
};
