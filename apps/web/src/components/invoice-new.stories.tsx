import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { delay, http } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import {
  desktop,
  menuOpen,
  phone,
  screen,
  skipping,
  wide,
} from '@/mocks/screen';
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

/** The screen is a workspace: no dock, so at 2xl the preview is nearly a
    Letter page's width beside the form (it was ~430px beside the dock). */
export const Workspace: Story = {
  ...ClientChosen,
  ...wide,
  play: async (ctx) => {
    await ClientChosen.play?.(ctx);
    const page = within(ctx.canvasElement.ownerDocument.body);
    await expect(
      page.queryByRole('complementary', { name: 'At a glance' }),
    ).toBeNull();
    const width = page
      .getByRole('region', { name: 'Preview' })
      .getBoundingClientRect().width;
    await expect(width).toBeGreaterThan(700);
  },
};

/** A change the server computes dims the figures and holds Generate until
    the answer lands; this one never does (US3 scenario 3). */
export const Updating: Story = {
  ...desktop,
  parameters: {
    /* The dimmed figures are the ones the next answer replaces, held back on
       purpose; axe reads their half opacity as low contrast. */
    a11y: skipping('aria-hidden-focus', 'color-contrast'),
    stalls: 1,
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

/** A charge follows the time lines as 1 x its amount, so its row checks
    like every other. */
export const WithCharge: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Add a charge' }),
    );
    const dialog = within(await page.findByRole('dialog'));
    await userEvent.type(
      dialog.getByLabelText(/Description/),
      'Hosting, September',
    );
    await userEvent.type(dialog.getByLabelText(/Amount/), '400');
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await expect(
      await page.findByRole('button', {
        name: 'Edit charge Hosting, September',
      }),
    ).toBeVisible();
    const row = (
      await card(page).findByRole('cell', { name: 'Hosting, September' })
    ).closest('tr') as HTMLElement;
    await expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Hosting, September', '1', '$400.00', '$400.00']);
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

/** From `xl` only the form and the preview scroll, each alone: reading
    the end of the page leaves the form where it was. */
export const ScrollsApart: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    const main = canvasElement.ownerDocument.querySelector('main');
    const scrollers = [...(main?.querySelectorAll('*') ?? [])].filter(
      (el) =>
        getComputedStyle(el).overflowY === 'auto' &&
        el.scrollHeight > el.clientHeight,
    );
    await expect(scrollers).toHaveLength(2);
    const [form, preview] = scrollers as [HTMLElement, HTMLElement];
    preview.scrollTop = preview.scrollHeight;
    await expect(preview.scrollTop).toBeGreaterThan(0);
    await expect(form.scrollTop).toBe(0);
    // A scroller scrolls sideways too: nothing in the form may spill.
    await expect(form.scrollWidth).toBeLessThanOrEqual(form.clientWidth);
    // The panel itself never scrolls.
    const panel = main?.parentElement as HTMLElement;
    await expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight);
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
    await userEvent.click(
      await page.findByRole('button', { name: 'Add an expense' }),
    );
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

// ── in-form dialogs ────────────────────────────────────────────────

/** An expense's name opens it, without leaving the invoice (US5
    scenario 1). */
export const EditingExpense: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Figma license, annual' }),
    );
    const dialog = await page.findByRole('dialog', { name: 'Edit expense' });
    // It fades in.
    await waitFor(() => expect(dialog).toBeVisible());
  },
};
export const EditingExpensePhone: Story = { ...EditingExpense, ...phone };

/** "+ Add a charge" asks for a description and an amount; Save waits for
    both (US5 scenario 3). */
export const NewCharge: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Add a charge' }),
    );
    const dialog = within(
      await page.findByRole('dialog', { name: 'New charge' }),
    );
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  },
};
export const NewChargePhone: Story = { ...NewCharge, ...phone };

/** The picker holds the default; its last item makes new payment details
    (US5 scenarios 5 and 6). */
export const NewPaymentDetails: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Payment details' }),
    );
    await userEvent.click(
      await page.findByRole('menuitem', { name: /New payment details/ }),
    );
    const dialog = await page.findByRole('dialog', { name: 'Payment details' });
    await waitFor(() => expect(dialog).toBeVisible());
  },
};
export const NewPaymentDetailsPhone: Story = {
  ...NewPaymentDetails,
  ...phone,
};
