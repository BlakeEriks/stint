import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { desktop, menuOpen, phone, screen } from '@/mocks/screen';
import { NewInvoice } from './invoice-new';

const meta = {
  title: 'Screens/Invoices/New',
  component: NewInvoice,
  ...screen('/invoices/new'),
} satisfies Meta<typeof NewInvoice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A client and a period, defaulting to last month. */
export const Blank: Story = { ...desktop };
export const Phone: Story = { ...phone };

/** The preview is exactly what generating writes. */
export const Previewed: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Client' }));
    await userEvent.click(
      await page.findByRole('menuitemradio', { name: /Northwind/ }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Preview' }));
    await expect(
      await page.findByRole('button', { name: /Generate/ }),
    ).toBeVisible();
  },
};

const previewFor = async (canvasElement: HTMLElement, charge?: string) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: 'Client' }));
  await userEvent.click(
    await page.findByRole('menuitemradio', { name: /Northwind/ }),
  );
  if (charge) {
    await userEvent.click(
      await page.findByRole('button', { name: /Add a charge/ }),
    );
    await userEvent.type(
      page.getByRole('textbox', { name: 'Charge 1 description' }),
      charge,
    );
    await userEvent.type(
      page.getByRole('textbox', { name: 'Charge 1 amount' }),
      '400',
    );
  }
  await userEvent.click(await page.findByRole('button', { name: 'Preview' }));
  return page;
};

/** Unrated work refuses generation rather than billing it at zero. */
export const Unrated: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      db.settings.defaultHourlyRate = null;
      for (const c of db.clients) c.hourlyRate = null;
      for (const p of db.projects) p.hourlyRate = null;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await previewFor(canvasElement);
    await expect(await page.findByText(/no rate/i)).toBeVisible();
  },
};

/** A charge is a flat amount: no quantity, no rate, after the time lines. */
export const WithCharge: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await previewFor(canvasElement, 'Hosting, September');
    await expect(
      await page.findByRole('cell', { name: 'Hosting, September' }),
    ).toBeVisible();
  },
};

// ── one summary line ───────────────────────────────────────────────

const summaryFor = async (canvasElement: HTMLElement, text: string) => {
  const page = await chooseNorthwind(canvasElement);
  await userEvent.click(
    await page.findByRole('button', { name: 'Show time as' }),
  );
  await userEvent.click(
    await page.findByRole('menuitemradio', { name: /One summary line/ }),
  );
  // The menu hides the page from queries until it has closed.
  await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
  if (text)
    await userEvent.type(await page.findByLabelText(/Summary line/), text);
  await userEvent.click(await page.findByRole('button', { name: 'Preview' }));
  return page;
};

/** All the time at one rate is one line of Blake's text (US1 scenario 1). */
export const OneSummaryLine: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      for (const p of db.projects) p.hourlyRate = null;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await summaryFor(
      canvasElement,
      'Software consulting services',
    );
    await expect(
      await page.findAllByRole('cell', {
        name: 'Software consulting services',
      }),
    ).toHaveLength(1);
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeEnabled();
  },
};

/** Two rates are two lines of the same text (US1 scenario 2). */
export const SummaryTwoRates: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await summaryFor(
      canvasElement,
      'Software consulting services',
    );
    await expect(
      await page.findAllByRole('cell', {
        name: 'Software consulting services',
      }),
    ).toHaveLength(2);
  },
};

/** An empty summary line is an error at the field, and Generate waits
    (US1 scenario 3). */
export const NoSummaryLine: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await summaryFor(canvasElement, '');
    await expect(
      await page.findByText('Give the summary line its text.'),
    ).toBeVisible();
    await expect(
      await page.findByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
  },
};

/** With a summary, the detail to attach from page 2, all unticked to start
    (US2 scenario 1). */
export const AttachDetail: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await summaryFor(
      canvasElement,
      'Software consulting services',
    );
    await userEvent.click(
      await page.findByRole('checkbox', { name: 'Hours by project' }),
    );
    await expect(
      page.getByRole('checkbox', { name: 'Hours by project' }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Hours by week' }),
    ).not.toBeChecked();
  },
};

/** Any other grouping has no Attach (US2 scenario 6). */
export const NoAttachWithoutSummary: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await page.findByRole('button', { name: 'Show time as' });
    await expect(page.queryByText('Attach')).toBeNull();
  },
};

// ── expenses ───────────────────────────────────────────────────────

const chooseNorthwind = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: 'Client' }));
  await userEvent.click(
    await page.findByRole('menuitemradio', { name: /Northwind/ }),
  );
  return page;
};

/** Waiting expenses land in the Preview card under their own heading, with
    a date and no quantity or rate (US1 scenario 1). */
export const WithExpenses: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await previewFor(canvasElement);
    await expect(
      await page.findByRole('heading', { name: 'Preview' }),
    ).toBeVisible();
    await expect(
      await page.findByRole('cell', { name: 'Figma license, annual' }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Aug 20, 2026' }),
    ).toBeVisible();
  },
};

/** Services, Expenses and a Total that is both (US1 scenario 2). */
export const GenerateWithExpenses: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await previewFor(canvasElement);
    await expect(await page.findByText('$380.00')).toBeVisible();
    await expect(page.getByText('Total')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeEnabled();
  },
};

/** A period with no time bills its expenses alone (US1 scenario 3). */
export const OnlyExpenses: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      for (const e of db.entries) e.isBillable = false;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await previewFor(canvasElement);
    await expect(
      await page.findByRole('cell', { name: 'Figma license, annual' }),
    ).toBeVisible();
    await expect(page.queryByText('Services')).toBeNull();
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeEnabled();
  },
};

/** No expenses: no Expenses section, as before (US1 scenario 4). */
export const NoExpenses: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      db.expenses = [];
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await previewFor(canvasElement);
    await page.findByRole('heading', { name: 'Preview' });
    await expect(page.queryByRole('checkbox', { name: /^Bill / })).toBeNull();
    await expect(page.queryByText('$380.00')).toBeNull();
  },
};

/** Unticking one clears the approved preview; the next leaves it out. */
export const UntickExpense: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await previewFor(canvasElement);
    await page.findByRole('cell', { name: 'Figma license, annual' });
    await userEvent.click(
      page.getByRole('checkbox', { name: 'Bill Figma license, annual' }),
    );
    await expect(page.queryByRole('heading', { name: 'Preview' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Preview' }));
    await page.findByRole('heading', { name: 'Preview' });
    await expect(
      page.queryByRole('cell', { name: 'Figma license, annual' }),
    ).toBeNull();
  },
};

/** Recorded here, it is saved for the client and joins the list, ticked
    (US2 scenario 3). */
export const AddExpenseHere: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Expense' }));
    await expect(
      await page.findByRole('dialog', { name: 'Add expense' }),
    ).toHaveTextContent('Northwind Trading');
    await userEvent.type(
      page.getByLabelText(/Description/),
      'Flight to Denver',
    );
    await userEvent.type(page.getByLabelText(/Amount/), '412');
    await userEvent.clear(page.getByLabelText(/Date paid/));
    await userEvent.type(page.getByLabelText(/Date paid/), '2026-08-12');
    await userEvent.click(page.getByRole('button', { name: 'Add expense' }));
    await expect(
      await page.findByRole('checkbox', { name: 'Bill Flight to Denver' }),
    ).toBeChecked();
  },
};

/** A recurring expense is ticked on every invoice, dated the period's last
    day (US4). */
export const RecurringTicked: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(
      await page.findByRole('checkbox', {
        name: 'Bill Claude Max subscription',
      }),
    ).toBeChecked();
    await userEvent.click(page.getByRole('button', { name: 'Preview' }));
    await page.findByRole('cell', { name: 'Claude Max subscription' });
    await expect(
      page.getByRole('cell', { name: 'Aug 31, 2026' }),
    ).toBeVisible();
  },
};
