import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { ids } from '@/mocks/fixtures';
import {
  desktop,
  expectOpen,
  failing,
  light,
  menuOpen,
  phone,
  screen,
  stalled,
} from '@/mocks/screen';
import { ClientList } from './client-list';

const meta = {
  title: 'Screens/Clients',
  component: ClientList,
  ...screen('/clients'),
} satisfies Meta<typeof ClientList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each client a heading, with its rate and summary line, its projects
    beneath at their resolved rates; "No client" last. */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const card = within(
      (await page.findByRole('heading', { name: 'Northwind Trading' })).closest(
        'section',
      )!,
    );
    await expect(card.getByText('$150.00/h · ap@northwind.test')).toBeVisible();
    // This screen manages clients; what is owed belongs to reports.
    await expect(card.queryByText(/unbilled/)).toBeNull();
    await expect(card.queryByText(/\d+ projects?/)).toBeNull();
  },
};
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** A client with no projects keeps its heading: this is the only list of
    clients. */
export const ClientWithoutProjects: Story = {
  ...desktop,
  parameters: account((db) => {
    db.projects = db.projects.filter((p) => p.clientId !== ids.byrne);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const card = within(
      (await page.findByRole('heading', { name: 'Byrne Studio' })).closest(
        'section',
      )!,
    );
    await expect(card.getByText('No projects yet.')).toBeVisible();
  },
};

/** Only work with no client: the "No client" group alone. */
export const OnlyClientless: Story = {
  ...desktop,
  parameters: account((db) => {
    db.clients = [];
    db.projects = db.projects.filter((p) => p.clientId === null);
  }),
};

/** No rate anywhere in the chain: the row says invoicing will refuse it. */
export const NoRate: Story = {
  ...desktop,
  parameters: account((db) => {
    db.settings.defaultHourlyRate = null;
  }),
};

const card = async (canvasElement: HTMLElement, name: string) =>
  within(
    (await within(canvasElement).findByRole('heading', { name })).closest(
      'section',
    )!,
  );

const openArchived = async (canvasElement: HTMLElement) =>
  userEvent.click(
    await within(canvasElement).findByRole('button', { name: /^Archived/ }),
  );

/** Archived clients wait below the active ones, collapsed under a count,
    so nothing looks deleted. */
export const ArchivedCollapsed: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const toggle = await page.findByRole('button', { name: 'Archived (1)' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.queryByRole('heading', { name: 'Old Engagement Co' }),
    ).toBeNull();
    await expect(page.queryByRole('tab')).toBeNull();
  },
};

/** Opened: archived clients A–Z after the active ones, muted, each with
    Restore; their projects moved with them and show no rate. */
export const ArchivedOpen: Story = {
  ...desktop,
  parameters: account((db) => {
    db.clients.find((c) => c.id === ids.byrne)!.archivedAt =
      '2026-08-31T16:00:00.000Z';
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const toggle = await page.findByRole('button', { name: 'Archived (2)' });
    await openArchived(canvasElement);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent)
        // The dock's Inbox and Today follow.
        .slice(0, 5),
    ).toEqual([
      'Meridian Labs',
      'Northwind Trading',
      'No client',
      'Byrne Studio',
      'Old Engagement Co',
    ]);
    const byrne = await card(canvasElement, 'Byrne Studio');
    await expect(byrne.getByText('Brand site rebuild')).toBeVisible();
    await expect(byrne.queryByText(/\/h/)).toBeNull();
    await expect(
      byrne.getByRole('button', { name: 'Restore Byrne Studio' }),
    ).toBeVisible();
  },
};

/** Nothing archived: no Archived section at all. */
export const NothingArchived: Story = {
  ...desktop,
  parameters: account((db) => {
    db.clients = db.clients.filter((c) => !c.archivedAt);
    db.projects = db.projects.filter((p) => !p.archivedAt);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByRole('heading', { name: 'Northwind Trading' });
    await expect(page.queryByRole('button', { name: /^Archived/ })).toBeNull();
  },
};

/** An archived project under an active client: last in its group, muted,
    with Restore where its rate was. */
export const ArchivedProjectLast: Story = {
  ...desktop,
  parameters: account((db) => {
    db.projects.find((p) => p.id === ids.warehouse)!.archivedAt =
      '2026-06-30T16:00:00.000Z';
  }),
  play: async ({ canvasElement }) => {
    const northwind = await card(canvasElement, 'Northwind Trading');
    // The first list is the projects; expenses follow.
    const rows = within(northwind.getAllByRole('list')[0]!).getAllByRole(
      'button',
      { name: /^Edit / },
    );
    await expect(rows.at(-1)).toHaveAccessibleName('Edit Warehouse dashboard');
    await expect(
      northwind.getByRole('button', { name: 'Restore Warehouse dashboard' }),
    ).toBeVisible();
    // It bills nothing new, so its row shows no rate.
    await expect(rows.at(-1)).not.toHaveTextContent('/h');
  },
};

export const Empty: Story = {
  ...desktop,
  parameters: account('empty'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText(/No clients yet/)).toBeVisible();
  },
};

/** A failed query says so, rather than loading forever. */
export const Failed: Story = {
  ...desktop,
  parameters: failing('clients', 'projects'),
  play: async ({ canvasElement }) => {
    // The screen only: the shell's own panels load beside it. A second
    // reader of a failed query refetches it, so the list passes through the
    // loader again before it settles on the error.
    const main = within(within(canvasElement).getByRole('main'));
    await waitFor(() => {
      expect(main.getByText(/could not load/i)).toBeVisible();
      expect(main.queryByRole('status')).toBeNull();
    });
  },
};

/** A project is added from its client's card, with that client chosen. */
export const NewProjectForClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', {
        name: 'Project for Northwind Trading',
      }),
    );
    await expectOpen(canvasElement, 'dialog');
    // Nothing to archive yet.
    await expect(page.queryByRole('button', { name: 'Archive' })).toBeNull();
  },
};

/** A new account's first project can still get a client: the menu offers
    to add one, after the no-client choice. */
export const NewProjectNoClients: Story = {
  ...desktop,
  parameters: {
    ...account((db) => {
      db.clients = [];
      db.projects = db.projects.filter((p) => p.clientId === null);
    }),
    ...menuOpen,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Project with no client' }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Client' }));
    await expectOpen(canvasElement, 'menu');
    await expect(
      page.getByRole('menuitem', { name: 'Add a client…' }),
    ).toBeVisible();
    await expect(page.getAllByRole('menuitemradio')[0]).toHaveTextContent(
      'No client — internal work',
    );
  },
};

/** A project's client can be created on the way, in a dialog of its own. */
export const NewProjectNewClient: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Project with no client' }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Client' }));
    await userEvent.click(
      await page.findByRole('menuitem', { name: /Add a client/ }),
    );
    await expectOpen(canvasElement, 'dialog', 'New client');
  },
};

/** Edit opens the project's dialog, which also archives it. */
export const EditProject: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Warehouse dashboard' }),
    );
    await expectOpen(canvasElement, 'dialog');
  },
};

/** Add client opens a dialog, never a page; saving lists the new client
    here, with nothing to archive yet. */
export const AddClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Add client' }),
    );
    await expectOpen(canvasElement, 'dialog', 'New client');
    await expect(page.queryByRole('button', { name: 'Archive' })).toBeNull();
    const dialog = within(page.getByRole('dialog'));
    await userEvent.type(dialog.getByLabelText(/Name/), 'Acme Robotics');
    await userEvent.click(dialog.getByRole('button', { name: 'Add client' }));
    await expect(
      await page.findByRole('heading', { name: 'Acme Robotics' }),
    ).toBeVisible();
    await expect(page.queryByRole('dialog')).toBeNull();
  },
};

/** A client edits in a dialog too, never a page, with Archive client. */
export const EditClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Northwind Trading' }),
    );
    await expectOpen(canvasElement, 'dialog', 'Edit client');
  },
};

const editNorthwind = async (page: ReturnType<typeof within>) => {
  await userEvent.click(
    await page.findByRole('button', { name: 'Edit Northwind Trading' }),
  );
  return within(await page.findByRole('dialog', { name: 'Edit client' }));
};

const pickSchedule = async (
  page: ReturnType<typeof within>,
  dialog: ReturnType<typeof within>,
  name: RegExp,
) => {
  await userEvent.click(
    dialog.getByRole('combobox', { name: /Billing schedule/ }),
  );
  await userEvent.click(await page.findByRole('option', { name }));
};

const saveDialog = async (
  page: ReturnType<typeof within>,
  dialog: ReturnType<typeof within>,
) => {
  await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
};

/** A client has no billing schedule until one is set; once saved, its
    dialog and its row both say it. */
export const ClientSchedule: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    let dialog = await editNorthwind(page);
    const select = () =>
      dialog.getByRole('combobox', { name: /Billing schedule/ });
    await expect(select()).toHaveTextContent('None');
    await expect(dialog.queryByLabelText('First period starts')).toBeNull();
    await pickSchedule(page, dialog, /^Semi-monthly/);
    await saveDialog(page, dialog);
    await expect(await page.findByText(/Billed semi-monthly/)).toBeVisible();
    dialog = await editNorthwind(page);
    await expect(select()).toHaveTextContent('Semi-monthly');
  },
};

/** Weekly asks which date a period starts on, filled in so a save never
    lacks one, and keeps it. */
export const ClientScheduleWeekly: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    let dialog = await editNorthwind(page);
    await pickSchedule(page, dialog, /^Weekly/);
    const anchor = dialog.getByLabelText('First period starts');
    await expect(anchor).not.toHaveValue('');
    await userEvent.clear(anchor);
    await userEvent.type(anchor, '2026-10-05');
    await saveDialog(page, dialog);
    await expect(await page.findByText(/Billed weekly/)).toBeVisible();
    dialog = await editNorthwind(page);
    await expect(dialog.getByLabelText('First period starts')).toHaveValue(
      '2026-10-05',
    );
  },
};

/** A client's own payment terms, kept once saved; empty uses the user's,
    and anything but whole days holds Save back. */
export const ClientPaymentTerms: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    let dialog = await editNorthwind(page);
    const field = () => dialog.getByLabelText('Payment terms');
    await expect(field()).toHaveValue('');
    await userEvent.type(field(), '1.5');
    await expect(dialog.getByText('Whole days, 0 to 365.')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Save changes' }),
    ).toBeDisabled();
    await userEvent.clear(field());
    await userEvent.type(field(), '15');
    await saveDialog(page, dialog);
    /* The row doesn't show terms, so nothing on the page says the refetch
       has landed; a dialog opened before it holds the old client. */
    await waitFor(async () => {
      if (page.queryByRole('dialog')) await userEvent.keyboard('{Escape}');
      dialog = await editNorthwind(page);
      await expect(field()).toHaveValue('15');
    });
  },
};

/** An archived client bills nothing new, so its row names no schedule,
    as it names no rate. */
export const ArchivedClientSchedule: Story = {
  ...desktop,
  parameters: account((db) => {
    for (const c of db.clients)
      if (c.id === ids.oldEngagement) c.billingSchedule = { period: 'monthly' };
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await openArchived(canvasElement);
    await page.findByRole('button', { name: 'Edit Old Engagement Co' });
    await expect(page.queryByText(/Billed monthly/)).toBeNull();
  },
};

/** An archived client's dialog offers Restore where Archive was. */
export const EditArchivedClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openArchived(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Old Engagement Co' }),
    );
    await expectOpen(canvasElement, 'dialog', 'Edit client');
    await expect(page.queryByRole('button', { name: 'Archive' })).toBeNull();
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  },
};

/** An archived project's dialog does the same. */
export const EditArchivedProject: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openArchived(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Legacy retainer' }),
    );
    await expectOpen(canvasElement, 'dialog');
    await expect(page.queryByRole('button', { name: 'Archive' })).toBeNull();
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  },
};

/** Restore on an archived client's card puts it back among the active on
    the press: the badge and the Archived section go, and its project keeps
    its own archive. */
export const RestoreClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openArchived(canvasElement);
    await userEvent.click(
      page.getByRole('button', { name: 'Restore Old Engagement Co' }),
    );
    await waitFor(() =>
      expect(page.queryByRole('button', { name: /^Archived/ })).toBeNull(),
    );
    const old = await card(canvasElement, 'Old Engagement Co');
    // One badge left, the project's own.
    await expect(old.getAllByText('Archived')).toHaveLength(1);
    await expect(old.getByText('Legacy retainer')).toBeVisible();
  },
};

/** The dialog's Restore does the same. */
export const RestoreClientFromDialog: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openArchived(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Old Engagement Co' }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Restore' }));
    const old = await card(canvasElement, 'Old Engagement Co');
    // One badge left, the project's own.
    await waitFor(() => expect(old.getAllByText('Archived')).toHaveLength(1));
    await expect(old.getByText('Legacy retainer')).toBeVisible();
  },
};

/** The same for a project from its row: its Archived badge goes on the
    press. */
export const RestoreProject: Story = {
  ...ArchivedProjectLast,
  play: async ({ canvasElement }) => {
    const northwind = await card(canvasElement, 'Northwind Trading');
    await userEvent.click(
      await northwind.findByRole('button', {
        name: 'Restore Warehouse dashboard',
      }),
    );
    await waitFor(() => expect(northwind.queryByText('Archived')).toBeNull());
  },
};

/** And from its dialog. */
export const RestoreProjectFromDialog: Story = {
  ...desktop,
  parameters: account((db) => {
    db.projects.find((p) => p.id === ids.warehouse)!.archivedAt =
      '2026-06-30T16:00:00.000Z';
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const northwind = await card(canvasElement, 'Northwind Trading');
    await expect(await northwind.findByText('Archived')).toBeVisible();
    await userEvent.click(
      page.getByRole('button', { name: 'Edit Warehouse dashboard' }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(northwind.queryByText('Archived')).toBeNull());
  },
};

/** A refused restore puts the badge back, and the notice says why. */
export const RestoreRefused: Story = {
  ...desktop,
  parameters: failing('updateClient'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openArchived(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Old Engagement Co' }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Restore' }));
    await expect(await page.findByText(/Internal server error/)).toBeVisible();
    const old = await card(canvasElement, 'Old Engagement Co');
    await expect(old.getAllByText('Archived')).toHaveLength(2);
  },
};

// ── expenses ───────────────────────────────────────────────────────

/** Recorded from the client's card (US2 scenario 1): it waits there. */
export const AddExpense: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', {
        name: 'Expense for Northwind Trading',
      }),
    );
    await expectOpen(canvasElement, 'dialog', 'Add expense');
    await userEvent.type(
      page.getByLabelText(/Description/),
      'Flight to Denver',
    );
    await userEvent.type(page.getByLabelText(/Amount/), '412');
    await userEvent.click(page.getByRole('button', { name: 'Add expense' }));
    await expect(await page.findByText('Flight to Denver')).toBeVisible();
    await expect(page.getByText('$412.00')).toBeVisible();
  },
};

/** A waiting expense opens its dialog from the row (US2 scenario 2). */
export const EditExpense: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Figma license, annual' }),
    );
    await expectOpen(canvasElement, 'dialog', 'Edit expense');
    const amount = page.getByLabelText(/Amount/);
    await userEvent.clear(amount);
    await userEvent.type(amount, '150');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(await page.findByText('$150.00')).toBeVisible();
  },
};

/** Delete lives in the dialog, not on the row (US2 scenario 2), and asks
    once: the first press only asks. */
export const DeleteExpense: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Figma license, annual' }),
    );
    await userEvent.click(
      await page.findByRole('button', { name: 'Delete expense' }),
    );
    expect(page.getAllByText('Figma license, annual').length).toBeGreaterThan(
      0,
    );
    await userEvent.click(
      page.getByRole('button', { name: 'Delete for good' }),
    );
    await waitFor(() =>
      expect(page.queryByText('Figma license, annual')).toBeNull(),
    );
  },
};

/** The delete is waiting on the server: the dialog stays open, the confirm
    says so, and the expense is still listed. */
export const DeletingExpense: Story = {
  ...desktop,
  parameters: stalled('deleteExpense'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Figma license, annual' }),
    );
    await userEvent.click(
      await page.findByRole('button', { name: 'Delete expense' }),
    );
    await userEvent.click(
      page.getByRole('button', { name: 'Delete for good' }),
    );
    await expect(
      await page.findByRole('button', { name: 'Deleting…' }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Keep' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await expect(page.getByRole('dialog')).toHaveAttribute(
      'data-state',
      'open',
    );
    // Behind the modal, so out of the accessibility tree but still listed.
    await expect(
      page.getByRole('button', {
        name: 'Edit Figma license, annual',
        hidden: true,
      }),
    ).toBeInTheDocument();
  },
};

/** A refused delete says why in the dialog, and is gone when another
    expense opens. */
export const DeleteExpenseRefused: Story = {
  ...desktop,
  parameters: failing('deleteExpense'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Figma license, annual' }),
    );
    await userEvent.click(
      await page.findByRole('button', { name: 'Delete expense' }),
    );
    await userEvent.click(
      page.getByRole('button', { name: 'Delete for good' }),
    );
    await expect(await page.findByRole('alert')).toHaveTextContent(
      'Internal server error',
    );
    // The alert lands a render before the press stops pending.
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).toBeEnabled());
    await userEvent.click(cancel);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Claude Max subscription' }),
    );
    await expectOpen(canvasElement, 'dialog', 'Edit expense');
    await expect(page.queryByRole('alert')).toBeNull();
  },
};

/** No expenses: no Expenses label, only the two buttons. */
export const NoExpenses: Story = {
  ...desktop,
  parameters: account((db) => {
    db.expenses = [];
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByRole('button', { name: 'Expense for Northwind Trading' });
    await expect(page.queryByText('Expenses')).toBeNull();
  },
};

/** Recurring comes first, labeled and undated; its dialog has no date
    (US4). */
export const RecurringExpense: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Claude Max subscription' }),
    );
    await expectOpen(canvasElement, 'dialog', 'Edit expense');
    await expect(
      page.getByRole('checkbox', { name: /Recurring/ }),
    ).toBeChecked();
    await expect(page.queryByLabelText(/Date paid/)).toBeNull();
  },
};

/** Byrne's draft, sent or paid, with the stock photography it billed. */
const billPhotos = (status: 'sent' | 'paid') =>
  account((db) => {
    const invoice = db.invoices.find((i) => i.sequenceNo === 15)!;
    invoice.status = status;
    invoice.sentAt = '2026-09-10T15:00:00.000Z';
    if (status === 'paid') invoice.paidAt = '2026-09-16T15:00:00.000Z';
    Object.assign(db.expenses.find((e) => e.id === ids.stockPhotos)!, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceStatus: status,
    });
  });

/** On an unpaid invoice (US3 scenario 1): muted, labeled with the invoice,
    and it opens the invoice rather than a dialog, since it is locked. */
export const BilledExpense: Story = {
  ...desktop,
  parameters: billPhotos('sent'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const row = await page.findByRole('link', { name: /Stock photography/ });
    await expect(row).toHaveAccessibleName(/on STINT-0015/);
    await expect(row.getAttribute('href')).toMatch(/^\/invoices\//);
  },
};

/** Once its invoice is paid, a billed expense leaves the card. */
export const PaidExpenseGone: Story = {
  ...desktop,
  parameters: billPhotos('paid'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByText('Figma license, annual');
    await expect(page.queryByText('Stock photography')).toBeNull();
  },
};

/** On its way: one quiet word where it will be, and none of it until all of
 *  it has arrived. */
export const Loading: Story = {
  ...desktop,
  parameters: stalled('clients'),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement.querySelector('main') as HTMLElement);
    await expect(await region.findByRole('status')).toHaveTextContent(
      'Loading',
    );
  },
};
