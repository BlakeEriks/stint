import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { addDays } from '@stint/core';
import { keys } from '@stint/client';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { type Db, id } from '@/mocks/fixtures';
import {
  desktop,
  failing,
  light,
  phone,
  screen,
  skipping,
  stalled,
  stalledWhen,
} from '@/mocks/screen';
import { InvoiceDetail } from './invoice-detail';

/* Each status offers its own actions: a draft is deleted or sent, an issued
   invoice voided, and Download is there in every status. */
const invoice = (seq: number) => id(300 + seq);

/** The action row, left to right, once the invoice has answered. */
const row = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement);
  const download = await page.findByRole('link', { name: 'Download PDF' });
  return [...download.parentElement!.children] as HTMLElement[];
};
const names = (buttons: HTMLElement[]) => buttons.map((b) => b.textContent);

/** The header's status line, under the amount. */
const statusLine = (canvasElement: HTMLElement, text: string) =>
  within(canvasElement).findByText(text, { selector: 'header p' });

/* A paying account, so every story but the locked ones shows the document.
   The seeded account is free with billing live. */
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

/** Number, client and period; amount and created date; then Delete, Edit,
    Download PDF and Mark sent, the step a draft waits on, in accent. */
export const Draft: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText('Type scale for the brand site'),
    ).toBeVisible();
    await expect(await statusLine(canvasElement, 'Created Sep 5')).toHaveClass(
      'text-muted',
    );
    const buttons = await row(canvasElement);
    await expect(names(buttons)).toEqual([
      'Delete',
      'Edit',
      'Download PDF',
      'Mark sent',
    ]);
    await expect(buttons.at(-1)).toHaveAttribute('data-variant', 'accent');
    await expect(
      page.getByText('Amount due').nextElementSibling,
    ).toHaveTextContent('$2,787.60');
    await expect(page.queryByText(/supporting detail/)).toBeNull();
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/invoices/${invoice(15)}/edit`,
    );
  },
};

/** One row on a phone: Edit and Download PDF are their icons, named for a
    screen reader; Delete and Mark sent keep their words. */
export const DraftPhone: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    const buttons = await row(canvasElement);
    const tops = new Set(buttons.map((b) => b.getBoundingClientRect().top));
    await expect(tops.size).toBe(1);
    const page = within(canvasElement);
    for (const name of ['Edit', 'Download PDF'])
      await expect(
        page.getByRole('link', { name }).getBoundingClientRect().width,
      ).toBe(36);
  },
};
/* The draft as the server sends it once work landed in its period. */
const newWork = paying((db) => {
  const draft = db.invoices.find((i) => i.id === invoice(15));
  if (draft)
    draft.newWork = { entries: 2, expenses: 0, hours: 2.5, amount: 275 };
});

/** Work logged in its period since it was built is offered, not added:
    the total stays until Add to draft, which takes the notice away. */
export const DraftNewWork: Story = {
  ...desktop,
  parameters: newWork,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText('2 new entries, 2.50h, in this period'),
    ).toBeVisible();
    await expect(
      page.getByText('Amount due').nextElementSibling,
    ).toHaveTextContent('$2,787.60');
    await userEvent.click(page.getByRole('button', { name: 'Add to draft' }));
    await waitFor(() => expect(page.queryByText(/in this period$/)).toBeNull());
  },
};
export const DraftNewWorkPhone: Story = { ...phone, parameters: newWork };

/** A refused press says why on the page, and the offer stays. */
export const AddWorkRefused: Story = {
  ...desktop,
  parameters: { ...newWork, ...failing('addDraftWork') },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Add to draft' }),
    );
    await expect(await page.findByRole('alert')).toBeVisible();
    await expect(page.getByText(/in this period$/)).toBeVisible();
  },
};

const fourteen = paying((db) => {
  const draft = db.invoices.find((i) => i.id === invoice(15));
  if (draft) draft.entryCount = 14;
});

/** Mark sent asks in a dialog that says what it fixes; Keep as draft
    takes it back. A download since doesn't hold it. */
export const MarkSentAsks: Story = {
  ...desktop,
  parameters: fourteen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Mark sent' }),
    );
    const dialog = within(await page.findByRole('dialog'));
    await expect(
      dialog.getByText(
        'This records that you sent it. Its 14 entries, any expenses on it and its $2,787.60 total stop changing. To correct it later, void it and issue a new one.',
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Mark sent' }),
    ).toBeEnabled();
    await userEvent.click(
      dialog.getByRole('button', { name: 'Keep as draft' }),
    );
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
  },
};

/* Mark sent's answer never comes. */
const sendStalls = stalled('updateInvoiceStatus');

/** Marking sent waits on the server: the confirm says so and the dialog
    stays. */
export const MarkSentPending: Story = {
  ...desktop,
  parameters: { ...fourteen, ...sendStalls },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Mark sent' }),
    );
    const dialog = within(await page.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Mark sent' }));
    await expect(
      await dialog.findByRole('button', { name: 'Marking sent…' }),
    ).toBeDisabled();
  },
};

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
    Mark sent is offered until it has one. */
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

/** Not yet due: its due and sent dates, then Void, Download PDF and Mark
    paid. An issued invoice is the invoice, not a preview of it. */
export const Sent: Story = {
  ...desktop,
  args: { id: invoice(14) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await statusLine(canvasElement, 'Due Oct 12 · Sent Sep 12');
    await expect(names(await row(canvasElement))).toEqual([
      'Void',
      'Download PDF',
      'Mark paid',
    ]);
    await expect(page.queryByRole('heading', { name: 'Preview' })).toBeNull();
  },
};

/** Past due: the status line is the header's one color. */
export const Overdue: Story = {
  ...desktop,
  args: { id: invoice(13) },
  play: async ({ canvasElement }) => {
    await expect(
      await statusLine(canvasElement, '19 days late · Due Aug 29'),
    ).toHaveClass('text-danger');
    await expect(names(await row(canvasElement)).at(-1)).toBe('Mark paid');
  },
};

/** The state this page is almost always in, all of it neutral. */
export const Paid: Story = {
  ...desktop,
  args: { id: invoice(12) },
  play: async ({ canvasElement }) => {
    await expect(
      await statusLine(canvasElement, 'Paid Sep 5 · Sent Aug 17'),
    ).toHaveClass('text-muted');
    await expect(names(await row(canvasElement))).toEqual([
      'Void',
      'Download PDF',
    ]);
  },
};
export const PaidLight: Story = { ...light, args: { id: invoice(12) } };

/** Voiding keeps the number and releases the entries: the amount is struck
    and only the download is left. */
export const Void: Story = {
  ...desktop,
  args: { id: invoice(9) },
  play: async ({ canvasElement }) => {
    await statusLine(canvasElement, 'Void. Its entries can be billed again.');
    await expect(names(await row(canvasElement))).toEqual(['Download PDF']);
    await expect(
      within(canvasElement).getByText(/^\$[\d,.]+$/, { selector: 'header p' }),
    ).toHaveClass('line-through');
  },
};
export const Missing: Story = { ...desktop, args: { id: invoice(99) } };

/** Free, with billing live: the document is the paid tier. The invoice
    still shows in full; Download gives way to subscribing, and the page says
    the records stay free. */
export const Locked: Story = {
  ...desktop,
  parameters: account('seeded'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const subscribe = await page.findByRole('link', {
      name: 'Get the paid plan to download',
    });
    await expect(subscribe).toHaveAttribute('href', '/settings#plan');
    await expect(
      page.getByText(/on the paid plan, \$3\.33\/month, billed annually/),
    ).toBeVisible();
    await expect(page.getByText(/exporting them included/)).toBeVisible();
    await expect(page.queryByRole('link', { name: /Download PDF/ })).toBeNull();
    await expect(page.getByText('Amount due')).toBeVisible();
  },
};
export const LockedPhone: Story = { ...phone, parameters: account('seeded') };

/** Billing not live: nothing is gated, as during beta. */
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

/** Opens a confirm from the action row and returns its dialog. */
const ask = async (canvasElement: HTMLElement, trigger: string) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: trigger }));
  return within(await page.findByRole('dialog'));
};

export const ConfirmDelete: Story = {
  ...desktop,
  parameters: fourteen,
  play: async ({ canvasElement }) => {
    const dialog = await ask(canvasElement, 'Delete');
    await expect(
      dialog.getByText(
        'Its 14 entries and any expenses go back to unbilled, ready for another invoice. The draft ($2,787.60) is deleted. You can’t undo this.',
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Keep it' }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('dialog'),
      ).toBeNull(),
    );
  },
};

export const Deleting: Story = {
  ...desktop,
  parameters: stalled('deleteInvoice'),
  play: async ({ canvasElement }) => {
    const dialog = await ask(canvasElement, 'Delete');
    await userEvent.click(dialog.getByRole('button', { name: 'Delete draft' }));
    await expect(
      await dialog.findByRole('button', { name: 'Deleting…' }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Keep it' }),
    ).toBeDisabled();
  },
};

export const ConfirmVoid: Story = {
  ...desktop,
  args: { id: invoice(14) },
  play: async ({ canvasElement }) => {
    const dialog = await ask(canvasElement, 'Void');
    await expect(
      dialog.getByText(/STINT-0014 \(\$[\d,.]+\) is no longer owed/),
    ).toBeVisible();
  },
};

export const Voiding: Story = {
  ...desktop,
  args: { id: invoice(14) },
  parameters: stalled('updateInvoiceStatus'),
  play: async ({ canvasElement }) => {
    const dialog = await ask(canvasElement, 'Void');
    await userEvent.click(dialog.getByRole('button', { name: 'Void invoice' }));
    await expect(
      await dialog.findByRole('button', { name: 'Voiding…' }),
    ).toBeDisabled();
  },
};

export const VoidRefusedPhone: Story = {
  ...phone,
  args: { id: invoice(14) },
  parameters: failing('updateInvoiceStatus'),
  play: async ({ canvasElement }) => {
    const dialog = await ask(canvasElement, 'Void');
    await userEvent.click(dialog.getByRole('button', { name: 'Void invoice' }));
    await expect(await dialog.findByRole('alert')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Void invoice' }),
    ).toBeEnabled();
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

/** The reference it was issued with, under the period. */
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
    };
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    for (const text of [
      'Net 30',
      'Payment details',
      'Pay online: https://pay.example.test/sam',
      'Thank you for the work this month.',
    ]) {
      await expect(await page.findByText(text)).toBeVisible();
    }
  },
};

/* Only the invoice the page opens never answers. The dock prefetches the
   overdue and stale ones too, and `stalled('invoice')` would hold those
   open as well: the story would pass or time out by which came first. */
const stalledInvoice = (opened: string) =>
  stalledWhen('invoice', (info) => info.params.id === opened);

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
    ...stalledInvoice(invoice(14)),
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
    // The client is drawn from the cached list before the invoice lands.
    await expect(page.getAllByText('Meridian Labs')[0]).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark paid' })).toBeVisible();
    await expect(page.queryByText('Amount due')).toBeNull();
    /* The lists don't say whether the PDF opens, so neither action shows
       yet rather than one that turns into the other. */
    await expect(page.queryByRole('link', { name: /Download PDF/ })).toBeNull();
    await expect(
      page.queryByRole('link', { name: /Get the paid plan/ }),
    ).toBeNull();
  },
};

/** On its way: one quiet word where it will be, and none of it until all of
 *  it has arrived. */
export const Loading: Story = {
  ...desktop,
  parameters: stalledInvoice(invoice(15)),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement.querySelector('main') as HTMLElement);
    await expect(await region.findByRole('status')).toHaveTextContent(
      'Loading',
    );
  },
};
