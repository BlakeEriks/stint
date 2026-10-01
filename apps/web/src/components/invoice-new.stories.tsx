import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { delay, http } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { desktop, menuOpen, phone, screen } from '@/mocks/screen';
import { NewInvoice } from './invoice-new';

const meta = {
  title: 'Screens/Invoices/New',
  component: NewInvoice,
  ...screen('/invoices/new'),
} satisfies Meta<typeof NewInvoice>;

export default meta;
type Story = StoryObj<typeof meta>;

type Page = ReturnType<typeof within>;

const chooseNorthwind = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: 'Client' }));
  await userEvent.click(
    await page.findByRole('menuitemradio', { name: /Northwind/ }),
  );
  await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
  return page;
};

/** The card has the server's current answer and Generate is live. */
const settled = async (page: Page) =>
  waitFor(
    () =>
      expect(
        page.getByRole('button', { name: 'Generate invoice' }),
      ).toBeEnabled(),
    { timeout: 3000 },
  );

const pickGrouping = async (page: Page, name: RegExp) => {
  await userEvent.click(
    await page.findByRole('button', { name: 'Show time as' }),
  );
  await userEvent.click(await page.findByRole('menuitemradio', { name }));
  // The menu hides the page from queries until it has closed.
  await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
};

const summaryFor = async (canvasElement: HTMLElement, text: string) => {
  const page = await chooseNorthwind(canvasElement);
  await pickGrouping(page, /One summary line/);
  if (text)
    await userEvent.type(await page.findByLabelText(/Summary line/), text);
  return page;
};

const card = (page: Page) =>
  within(page.getByRole('region', { name: 'Preview' }));

// ── states ─────────────────────────────────────────────────────────

/** No client yet: Generate waits and the card says what it needs. */
export const Blank: Story = { ...desktop };
export const Phone: Story = { ...phone };

/** A client chosen: the card is the invoice as the PDF prints it, and
    follows the form without a Preview button (US3 scenario 1). */
export const ClientChosen: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await expect(card(page).getByText('Service period')).toBeVisible();
    await expect(page.queryByRole('button', { name: 'Preview' })).toBeNull();
  },
};
export const ClientChosenPhone: Story = { ...ClientChosen, ...phone };

/** A change the server computes dims the figures and holds Generate until
    the answer lands; this one never does (US3 scenario 3). */
export const Updating: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    msw: {
      handlers: {
        // The play's By task never answers; every other preview does.
        previewInvoice: http.post(
          handlers.previewInvoice.info.path,
          async (info) => {
            const body = (await info.request.clone().json()) as {
              groupingMode?: string;
            };
            if (body.groupingMode === 'task') await delay('infinite');
            // `resolver` is protected in msw's types, and public at runtime.
            const real = handlers.previewInvoice as unknown as {
              resolver: (i: typeof info) => Promise<Response>;
            };
            return real.resolver(info);
          },
        ),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await pickGrouping(page, /By task/);
    await expect(await page.findByText('Updating…')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
  },
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
    const page = await chooseNorthwind(canvasElement);
    await expect(await page.findByText(/no rate/i)).toBeVisible();
  },
};

/** A charge is a flat amount: no quantity, no rate, after the time lines. */
export const WithCharge: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: /Add a charge/ }),
    );
    await userEvent.type(
      page.getByRole('textbox', { name: 'Charge 1 description' }),
      'Hosting, September',
    );
    await userEvent.type(
      page.getByRole('textbox', { name: 'Charge 1 amount' }),
      '400',
    );
    await expect(
      await card(page).findByRole('cell', { name: 'Hosting, September' }),
    ).toBeVisible();
  },
};

/** A reference prints under the service period, at once (US4 scenario 1). */
export const WithReference: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.type(
      page.getByLabelText('Reference'),
      'ICA dated Aug 5, 2026 · Exhibit A SOW',
    );
    await expect(
      card(page).getByText('ICA dated Aug 5, 2026 · Exhibit A SOW'),
    ).toBeVisible();
  },
};

/** No reference, no Reference row (US4 scenario 2). */
export const NoReference: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await expect(card(page).queryByText('Reference')).toBeNull();
  },
};

// ── one summary line ───────────────────────────────────────────────

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
    await settled(page);
    await expect(
      card(page).getAllByRole('cell', { name: 'Software consulting services' }),
    ).toHaveLength(1);
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
    await settled(page);
    await expect(
      card(page).getAllByRole('cell', { name: 'Software consulting services' }),
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
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
  },
};
export const NoSummaryLinePhone: Story = { ...NoSummaryLine, ...phone };

// ── supporting detail ──────────────────────────────────────────────

/** Ticked detail shows at once under "Page 2 · supporting detail"
    (US2 scenario 2, US3 scenario 2). */
export const AttachDetail: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await summaryFor(
      canvasElement,
      'Software consulting services',
    );
    await settled(page);
    for (const name of ['Hours by project', 'Hours by week', 'Hours by date'])
      await expect(page.getByRole('checkbox', { name })).not.toBeChecked();
    await userEvent.click(
      page.getByRole('checkbox', { name: 'Hours by project' }),
    );
    await expect(
      card(page).getByText('Page 2 · supporting detail'),
    ).toBeVisible();
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

/** Waiting expenses land in the card under their own heading, with a date
    and no quantity or rate. */
export const WithExpenses: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(
      await card(page).findByRole('cell', { name: 'Figma license, annual' }),
    ).toBeVisible();
    await expect(
      card(page).getByRole('cell', { name: 'Aug 20, 2026' }),
    ).toBeVisible();
  },
};

/** A period with no time bills its expenses alone. */
export const OnlyExpenses: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      for (const e of db.entries) e.isBillable = false;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await expect(
      card(page).getByRole('cell', { name: 'Figma license, annual' }),
    ).toBeVisible();
    await expect(card(page).queryByText('Services')).toBeNull();
  },
};

/** Unticking one asks the server again and leaves it off. */
export const UntickExpense: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await userEvent.click(
      page.getByRole('checkbox', { name: 'Bill Figma license, annual' }),
    );
    await settled(page);
    await expect(
      card(page).queryByRole('cell', { name: 'Figma license, annual' }),
    ).toBeNull();
  },
};

/** Recorded here, it is saved for the client and joins the list, ticked. */
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
    day. */
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
    await expect(
      await card(page).findByRole('cell', { name: 'Claude Max subscription' }),
    ).toBeVisible();
    await expect(
      card(page).getByRole('cell', { name: 'Aug 31, 2026' }),
    ).toBeVisible();
  },
};
