import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { delay, http } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import type { Db } from '@/mocks/fixtures';
import { ids } from '@/mocks/fixtures';
import { handlers } from '@/mocks/handlers';
import {
  at,
  desktop,
  menuOpen,
  phone,
  screen,
  skipping,
  stalled,
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

const chooseMeridian = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: 'Client' }));
  await userEvent.click(
    await page.findByRole('menuitemradio', { name: /Meridian/ }),
  );
  await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
  return page;
};

const card = (page: Page) =>
  within(page.getByRole('region', { name: 'Preview' }));

/** The bordered sheet itself, which holds only what prints. */
const sheet = (page: Page) =>
  card(page).getByText('Bill to').closest('.rounded-lg') as HTMLElement;

// ── states ─────────────────────────────────────────────────────────

/** No client yet: Generate waits, and in place of a card a line says what
    it needs. */
export const Blank: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const region = within(
      await within(canvasElement).findByRole('region', { name: 'Preview' }),
    );
    const prompt = region.getByText(/^Choose a client to see/);
    await expect(prompt).toBeVisible();
    await expect(prompt.closest('.rounded-lg')).toBeNull();
  },
};
export const Phone: Story = { ...phone };

/** On September 17 the period is September, the month ending nearest, and
    due follows the settings' Net 30 terms. The card follows both. */
export const Defaults: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-01');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-30');
    await expect(page.getByLabelText('Due')).toHaveValue('2026-10-17');
    await expect(await card(page).findByText(/Oct 17, 2026/)).toBeVisible();
  },
};

/** Northwind pays in 15 days: Due is September 17 plus 15, and the card
    prints Net 15. */
export const ClientTerms: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      for (const c of db.clients)
        if (c.id === ids.northwind) c.paymentTermsDays = 15;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(page.getByLabelText('Due')).toHaveValue('2026-10-02');
    await expect(await card(page).findByText('Net 15')).toBeVisible();
  },
};

/** A due date before the issue date says so under the dates and holds
    Generate back. */
export const EarlyDue: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    const due = page.getByLabelText('Due');
    await userEvent.clear(due);
    await userEvent.type(due, '2026-09-10');
    await expect(
      await page.findByText("Due can't be before the issue date."),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
  },
};

const scheduled = (
  id: string,
  billingSchedule: Db['clients'][number]['billingSchedule'],
) =>
  account((db) => {
    for (const c of db.clients)
      if (c.id === id) c.billingSchedule = billingSchedule;
  });

/** Billed twice a month: on September 17 the period is the last half that
    has ended, the 1st to the 15th. */
export const ScheduledDefaults: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...scheduled(ids.northwind, { period: 'semimonthly' }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-01');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-15');
    await expect(page.queryByText(/is billed/)).toBeNull();
  },
};

/** Billed weekly from a Monday: on Thursday September 17 the period is the
    week before, Monday to Sunday, counted back from a later anchor. */
export const WeeklyDefaults: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...scheduled(ids.northwind, { period: 'weekly', anchor: '2026-10-05' }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-07');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-13');
  },
};

/** Opened from the Inbox's row for a period that ended with no invoice:
    the client and period are filled in, and nothing is made yet. */
export const FromInboxLink: Story = {
  ...desktop,
  parameters: {
    ...at('/invoices/new', {
      client: ids.northwind,
      from: '2026-09-01',
      to: '2026-09-15',
    }),
    ...scheduled(ids.northwind, { period: 'semimonthly' }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole('button', { name: 'Client' }),
    ).toHaveTextContent('Northwind');
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-01');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-15');
    await settled(page);
  },
};

/** Dates the user edited stay when another client is chosen. */
export const EditedDatesStay: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...scheduled(ids.meridian, { period: 'semimonthly' }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.clear(page.getByLabelText('From'));
    await userEvent.type(page.getByLabelText('From'), '2026-09-05');
    await chooseMeridian(canvasElement);
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-05');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-30');
  },
};

/** A period that isn't one of the client's is named, but the invoice can
    still be generated: a first or last invoice can cover part of one. */
export const OffSchedule: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...scheduled(ids.northwind, { period: 'monthly' }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(page.queryByText(/is billed/)).toBeNull();
    await userEvent.clear(page.getByLabelText('From'));
    await expect(page.queryByText(/is billed/)).toBeNull();
    await userEvent.type(page.getByLabelText('From'), '2026-09-16');
    await expect(
      await page.findByText(
        "Northwind Trading is billed monthly, and this isn't one of its periods.",
      ),
    ).toBeVisible();
    await settled(page);
  },
};
export const OffSchedulePhone: Story = { ...OffSchedule, ...phone };

/** Without a schedule, any period is the user's own, and nothing is said. */
export const NoScheduleNoHint: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.clear(page.getByLabelText('From'));
    await userEvent.type(page.getByLabelText('From'), '2026-09-16');
    await settled(page);
    await expect(page.queryByText(/is billed/)).toBeNull();
  },
};

/** Byrne's August draft is open, so a period reaching into August says
    which draft holds those dates and Generate waits. */
export const OverlapsDraft: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Client' }));
    await userEvent.click(
      await page.findByRole('menuitemradio', { name: /Byrne/ }),
    );
    await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
    await userEvent.clear(page.getByLabelText('From'));
    await userEvent.type(page.getByLabelText('From'), '2026-08-20');
    await expect(
      await page.findByText(
        (_, el) =>
          el?.tagName === 'P' &&
          /^A draft already covers Aug 1.*for Byrne Studio: STINT-0015\./.test(
            el.textContent ?? '',
          ),
      ),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'STINT-0015' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
  },
};

/** A client chosen: the card is the invoice as the PDF prints it, and
    follows the form without a Preview button (US3 scenario 1). What
    generating does reads under the card, not on it. Northwind has an address
    and email, so the Client field offers no Edit client. */
export const ClientChosen: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await expect(card(page).getByText('Service period')).toBeVisible();
    const footnote = card(page).getByText(/^Generating assigns a number/);
    await expect(footnote).toBeVisible();
    await expect(sheet(page).contains(footnote)).toBe(false);
    await expect(page.queryByRole('button', { name: 'Preview' })).toBeNull();
    await expect(
      page.queryByRole('button', { name: 'Edit client' }),
    ).toBeNull();
  },
};
export const ClientChosenPhone: Story = { ...ClientChosen, ...phone };

/** Work already billed from another tool: "Already billed this?", beside the
    preview's entry count, marks the time the card shows, the card keeps only the expenses, and the toast offers
    Undo (US1 scenarios 1–2). */
export const BilledElsewhere: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await userEvent.click(
      page.getByRole('button', { name: 'Already billed this?' }),
    );
    await expect(
      await page.findByText(/entries marked billed elsewhere/),
    ).toBeVisible();
    await expect(await page.findByText('0 entries')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Already billed this?' }),
    ).toBeDisabled();
  },
};

/** Undo puts exactly that work back on the card (US1 scenario 3). */
export const BilledElsewhereUndone: Story = {
  ...desktop,
  play: async (ctx) => {
    await BilledElsewhere.play?.(ctx);
    const page = within(ctx.canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Undo' }));
    await expect(await page.findByText('15 entries')).toBeVisible();
    await expect(page.queryByText(/marked billed elsewhere/)).toBeNull();
  },
};

/** The screen is a workspace: the dock folds to a strip, so at 2xl the
    preview is 700px beside the form (it was ~430px beside the dock). */
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
    await expect(width).toBeGreaterThanOrEqual(700);
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

/** Work that overlaps other time is named under the card before it bills,
    but the invoice can still be generated: the user decides. */
export const Overlapping: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      // Half an hour into September's first Northwind block, which the
      // default period bills.
      const northwind = new Set(
        db.projects
          .filter((p) => p.clientId === ids.northwind)
          .map((p) => p.id),
      );
      const first = db.entries.find(
        (e) =>
          e.startedAt.startsWith('2026-09') &&
          e.invoiceId === null &&
          northwind.has(e.projectId as string),
      ) as Db['entries'][number];
      const later = (iso: string) =>
        new Date(Date.parse(iso) + 30 * 60_000).toISOString();
      db.entries.push({
        ...first,
        id: '018f0000-0000-7000-8000-0000000000f1',
        taskName: 'Follow-up call',
        startedAt: later(first.startedAt),
        endedAt: later(first.endedAt as string),
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    const warning = await page.findByText(/entries overlap other time/);
    await expect(warning).toBeVisible();
    await expect(sheet(page).contains(warning)).toBe(false);
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
        name: /^Edit charge Hosting, September/,
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

/** A note prints on this invoice, and the card shows it at once. */
export const WithNotes: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.type(
      page.getByLabelText('Notes'),
      'Thanks for a great month.',
    );
    await expect(
      card(page).getByText('Thanks for a great month.'),
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

const changeNumber = async (canvasElement: HTMLElement, next: string) => {
  const page = await chooseNorthwind(canvasElement);
  await settled(page);
  await userEvent.type(page.getByLabelText('Reference'), 'PO-7');
  return { page, form: await saveNumber(page, 'STINT-0016', next) };
};

/** Opens Change on the "Numbered" line and saves `next`. STINT-0015 is
    the highest number an invoice holds. */
const saveNumber = async (
  page: ReturnType<typeof within>,
  shown: string,
  next: string,
) => {
  const line = page.getByText(new RegExp(`Numbered ${shown}`));
  await userEvent.click(within(line).getByRole('button', { name: 'Change' }));
  const dialog = await page.findByRole('dialog', { name: 'Invoice number' });
  await waitFor(() => expect(dialog).toBeVisible());
  const form = within(dialog);
  const field = form.getByLabelText('Next number');
  // Prefix, then number, in reading and tab order, as the invoice prints.
  await expect(
    form.getByLabelText('Prefix').compareDocumentPosition(field),
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  await userEvent.clear(field);
  await userEvent.type(field, next);
  await userEvent.click(form.getByRole('button', { name: 'Save' }));
  return form;
};

/** The number Generate takes shows before it does. Change moves it in a
    dialog, so the draft being built stays as it was. */
export const ChangeNumber: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const { page } = await changeNumber(canvasElement, '20');
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(page.getByText(/Numbered STINT-0020/)).toBeVisible();
    await expect(page.getByLabelText('Reference')).toHaveValue('PO-7');
  },
};

/** A raise can be taken back: 16 is still free after moving to 20. */
export const ChangeNumberBack: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const { page } = await changeNumber(canvasElement, '20');
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await saveNumber(page, 'STINT-0020', '16');
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(page.getByText(/Numbered STINT-0016/)).toBeVisible();
  },
};

/** A number an invoice already holds is refused in the open dialog, which
    says which one and what is free. */
export const ChangeNumberRefused: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const { form } = await changeNumber(canvasElement, '10');
    await expect(
      await form.findByText(
        'Must be higher than STINT-0015, your latest invoice.',
        {},
        { timeout: 3000 },
      ),
    ).toBeVisible();
    await expect(form.getByLabelText('Next number')).toHaveValue(10);
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

/** All the time at one rate is one line of the contractor's text (US1 scenario 1). */
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
      page.getByLabelText(/Summary line/),
    ).toHaveAccessibleDescription('Give the summary line its text.');
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

/** The client's last invoice was a summary, so this one opens as one,
    with its text and its ticks, still editable. */
export const FromLastInvoice: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      const last = db.invoices
        .filter((i) => i.clientId === ids.northwind && i.status !== 'void')
        .sort(
          (a, b) => b.sequenceNo - a.sequenceNo,
        )[0] as Db['invoices'][number];
      last.groupingMode = 'summary';
      last.summaryText = 'Software consulting services';
      last.supportingDetail = { week: [], totalHours: 0 };
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(await page.findByLabelText(/Summary line/)).toHaveValue(
      'Software consulting services',
    );
    await expect(
      page.getByRole('checkbox', { name: 'Hours by week' }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Hours by project' }),
    ).not.toBeChecked();
    await settled(page);
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
      card(page).getByRole('cell', { name: 'Sep 30, 2026' }),
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
      await page.findByRole('button', { name: /^Edit Figma license, annual/ }),
    );
    const dialog = await page.findByRole('dialog', { name: 'Edit expense' });
    // It fades in.
    await waitFor(() => expect(dialog).toBeVisible());
  },
};
export const EditingExpensePhone: Story = { ...EditingExpense, ...phone };

/** A client with no address or email: the Client field says so and offers
    Edit client; the card stays the invoice as printed. */
export const ClientMissingDetails: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseMeridian(canvasElement);
    await expect(await page.findByText(/No address or email/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Edit client' }),
    ).toBeVisible();
    await expect(
      card(page).queryByRole('button', { name: 'Edit client' }),
    ).toBeNull();
  },
};
export const ClientMissingDetailsPhone: Story = {
  ...ClientMissingDetails,
  ...phone,
};

/** Saving the client updates Bill to in place; the draft is kept. Archive
    is left out here. */
export const EditingClient: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseMeridian(canvasElement);
    await userEvent.type(page.getByLabelText(/Reference/), 'PO-7');
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit client' }),
    );
    const dialog = within(
      await page.findByRole('dialog', { name: 'Edit client' }),
    );
    await expect(dialog.queryByRole('button', { name: 'Archive' })).toBeNull();
    await userEvent.type(dialog.getByLabelText(/Email/), 'ap@meridian.test');
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
    // An open dialog hides the page, the card with it, from role queries.
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(
      await card(page).findByText(/ap@meridian\.test/),
    ).toBeVisible();
    await expect(page.getByText(/^No address ·/)).toBeVisible();
    await expect(page.getByLabelText(/Reference/)).toHaveValue('PO-7');
  },
};

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

/** On its way: one quiet word where it will be, and none of it until all of
 *  it has arrived. */
export const Loading: Story = {
  ...desktop,
  parameters: stalled('settings'),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement.querySelector('main') as HTMLElement);
    await expect(await region.findByRole('status')).toHaveTextContent(
      'Loading',
    );
  },
};

const noSender = account((db: Db) => {
  db.settings.businessName = null;
  db.settings.businessEmail = null;
});

/** No business name or email: the notice says so, Generate waits, and the
 *  preview marks where the sender prints, saying so under the card. */
export const DetailsMissing: Story = {
  ...desktop,
  parameters: noSender,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(
      await page.findByText('Your business details are missing'),
    ).toBeVisible();
    const marker = await page.findByText(/^Your business name and email/);
    await expect(marker).toBeVisible();
    await expect(sheet(page).contains(marker)).toBe(false);
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
  },
};

export const DetailsMissingPhone: Story = { ...DetailsMissing, ...phone };

/** Add details opens the dialog; saving fills the preview and frees Generate. */
export const AddDetails: Story = {
  ...desktop,
  parameters: noSender,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Add details' }),
    );
    const dialog = await page.findByRole('dialog', {
      name: 'Who is this invoice from?',
    });
    await waitFor(() => expect(dialog).toBeVisible());
    const form = within(dialog);
    await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(
      form.getByRole('textbox', { name: /Business name/ }),
      'Sam Rivera Consulting',
    );
    await userEvent.type(
      form.getByRole('textbox', { name: /Email/ }),
      'sam@lakeline.test',
    );
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(
      page.queryByText('Your business details are missing'),
    ).toBeNull();
    await expect(page.getByText('Sam Rivera Consulting')).toBeVisible();
    await settled(page);
  },
};

/** The save is refused: the dialog stays with what was typed, and why. */
export const DetailsSaveFails: Story = {
  ...desktop,
  parameters: {
    ...noSender,
    msw: {
      handlers: {
        updateSettings: http.patch(handlers.updateSettings.info.path, () =>
          Response.json(
            { code: 'VALIDATION_FAILED', message: 'Enter a valid email.' },
            { status: 422 },
          ),
        ),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Add details' }),
    );
    const dialog = await page.findByRole('dialog', {
      name: 'Who is this invoice from?',
    });
    await waitFor(() => expect(dialog).toBeVisible());
    const form = within(dialog);
    await userEvent.type(
      form.getByRole('textbox', { name: /Business name/ }),
      'Sam Rivera Consulting',
    );
    await userEvent.type(form.getByRole('textbox', { name: /Email/ }), 'sam@x');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await expect(await form.findByText('Enter a valid email.')).toBeVisible();
    await expect(
      form.getByRole('textbox', { name: /Business name/ }),
    ).toHaveValue('Sam Rivera Consulting');
  },
};
