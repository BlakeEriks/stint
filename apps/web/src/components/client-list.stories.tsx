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

/** No Active / Archived / All filter: an archived client and an archived
    project show where they belong, each with its badge. */
export const ArchivedShown: Story = {
  ...desktop,
  parameters: account((db) => {
    const warehouse = db.projects.find((p) => p.id === ids.warehouse)!;
    warehouse.archivedAt = '2026-06-30T16:00:00.000Z';
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByText('Warehouse dashboard');
    await expect(page.getAllByText('Archived').length).toBeGreaterThan(1);
    await expect(page.queryByRole('tab')).toBeNull();
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
    const page = within(canvasElement);
    await expect(await page.findByText(/could not load/i)).toBeVisible();
    await expect(page.queryByText(/loading/i)).toBeNull();
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

/** An archived client's dialog has nothing left to archive. */
export const EditArchivedClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Old Engagement Co' }),
    );
    await expectOpen(canvasElement, 'dialog', 'Edit client');
    await expect(page.queryByRole('button', { name: 'Archive' })).toBeNull();
  },
};

/** Nor does an archived project's. */
export const EditArchivedProject: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Legacy retainer' }),
    );
    await expectOpen(canvasElement, 'dialog');
    await expect(page.queryByRole('button', { name: 'Archive' })).toBeNull();
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

/** Delete lives in the dialog, not on the row (US2 scenario 2). */
export const DeleteExpense: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Figma license, annual' }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(page.queryByText('Figma license, annual')).toBeNull(),
    );
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

/** On an unpaid invoice (US3 scenario 1): muted, labeled with the invoice,
    and it opens the invoice rather than a dialog, since it is locked. */
export const BilledExpense: Story = {
  ...desktop,
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
  parameters: account((db) => {
    const draft = db.invoices.find((i) => i.sequenceNo === 15)!;
    draft.status = 'paid';
    draft.paidAt = '2026-09-16T15:00:00.000Z';
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByText('Figma license, annual');
    await expect(page.queryByText('Stock photography')).toBeNull();
  },
};
