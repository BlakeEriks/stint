import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  getRouter,
  useSearchParams,
} from '@storybook/nextjs-vite/navigation.mock';
import { http } from 'msw';
import { useEffect, useReducer } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account, getDb } from '@/mocks/db';
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
  stalledWhen,
  tablet,
  wide,
  foldDock,
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
  const field = await page.findByLabelText('Summary line');
  await userEvent.clear(field);
  if (text) await userEvent.type(field, text);
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

/** Opens Period, where From and To are, unless it is open. */
const period = async (page: Page) => {
  if (!page.queryByLabelText('From'))
    await userEvent.click(await page.findByRole('button', { name: 'Period' }));
  await page.findByLabelText('From');
  return page;
};

/** Opens the page's No., Issued and Due. */
const openDates = async (page: Page, shown = 'STINT-0016') => {
  await userEvent.click(
    await page.findByRole('button', {
      name: new RegExp(`^Edit No\\. ${shown}`),
    }),
  );
  const dialog = await page.findByRole('dialog', { name: 'Number and dates' });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

/** The count and amount beside Generate. */
const due = (page: Page) =>
  within(
    page.getByRole('button', { name: 'Generate invoice' })
      .parentElement as HTMLElement,
  );

const card = (page: Page) =>
  within(page.getByRole('region', { name: 'Preview' }));

/** The bordered sheet itself, which holds only what prints. */
const sheet = (page: Page) =>
  card(page).getByText('Bill to').closest('.rounded-lg') as HTMLElement;

const scheduled = (
  id: string,
  billingSchedule: Db['clients'][number]['billingSchedule'],
) =>
  account((db) => {
    for (const c of db.clients)
      if (c.id === id) c.billingSchedule = billingSchedule;
  });

// ── states ─────────────────────────────────────────────────────────

/** No client yet: every control is there and Client has focus, since it
    comes first. The page prints what it already knows, Bill to says what
    is left to choose, and Generate waits. */
export const Blank: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByRole('button', { name: 'Client' }),
    ).toHaveFocus();
    for (const name of ['Period', 'Show time as', 'Template'])
      await expect(page.getByRole('button', { name })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Edit Sam Rivera/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Choose a client' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
    // No client, no format yet: nothing to fault.
    await expect(
      page.queryByText('Give the summary line its text.'),
    ).toBeNull();
  },
};
export const Phone: Story = { ...Blank, ...phone };

/** On September 17 the period is September, the month ending nearest, and
    due follows the settings' Net 30 terms. The card follows both. */
export const Defaults: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(
      page.getByRole('button', { name: 'Period' }),
    ).toHaveTextContent('Sep 1 – Sep 30, 2026');
    await period(page);
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-01');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-30');
    await expect(await card(page).findByText('Oct 17, 2026')).toBeVisible();
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
    await expect(await card(page).findByText('Oct 2, 2026')).toBeVisible();
    await expect(await card(page).findByText('Net 15')).toBeVisible();
  },
};

/** The page's dates open a dialog; a due date before the issue date is
    refused there, and the invoice keeps the one it had. */
export const EarlyDue: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    const form = await openDates(page);
    const due = form.getByLabelText('Due');
    await expect(due).toHaveValue('2026-10-17');
    await userEvent.clear(due);
    await userEvent.type(due, '2026-09-10');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await expect(due).toHaveAccessibleDescription(
      /Due can't be before the issue date\./,
    );
    await expect(due).toHaveFocus();
  },
};

/** A due date saved there is this invoice's alone, and the page prints it. */
export const ChangeDue: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    const form = await openDates(page);
    await userEvent.clear(form.getByLabelText('Due'));
    await userEvent.type(form.getByLabelText('Due'), '2026-10-31');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(await card(page).findByText('Oct 31, 2026')).toBeVisible();
    await expect(getDb().settings.nextInvoiceNumber).toBe(16);
  },
};

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
    await period(page);
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
    await period(page);
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-07');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-13');
  },
};

/** Opened from the Inbox's row for a client ready to invoice:
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
    await period(page);
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-01');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-15');
    await settled(page);
  },
};

let address = new URLSearchParams();

/** The Inbox stays reachable on this page, so its row is pressed here: the
    address changes under an open form, and the form takes the link. */
export const PressedFromTheInbox: Story = {
  ...tablet,
  parameters: scheduled(ids.northwind, { period: 'semimonthly' }),
  beforeEach: () => {
    address = new URLSearchParams();
    useSearchParams.mockImplementation(() => address as never);
  },
  /* Storybook's Link goes nowhere, so a press on it changes the address the
     way the app would. */
  render: function Render() {
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      const follow = (e: MouseEvent) => {
        const href = (e.target as Element).closest('a')?.getAttribute('href');
        if (!href?.startsWith('/invoices/new?')) return;
        e.preventDefault();
        address = new URLSearchParams(href.split('?')[1]);
        rerender();
      };
      document.addEventListener('click', follow, true);
      return () => document.removeEventListener('click', follow, true);
    }, []);
    return <NewInvoice />;
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const row = (
      await page.findByText('Sep 1 – 15 is ready to invoice')
    ).closest('[data-tone]') as HTMLElement;
    await userEvent.click(
      within(row).getByRole('link', { name: 'Northwind Trading' }),
    );
    await waitFor(() =>
      expect(page.getByRole('button', { name: 'Period' })).toHaveTextContent(
        'Sep 1 – Sep 15, 2026',
      ),
    );
    await expect(
      page.getByRole('button', { name: 'Client' }),
    ).toHaveTextContent('Northwind');
    await settled(page);
  },
};

/** A preset sets both ends, and Period names the one it matches. On
    September 17 the last two weeks end yesterday. */
export const PeriodPreset: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await period(await chooseNorthwind(canvasElement));
    await userEvent.click(page.getByRole('button', { name: 'Last two weeks' }));
    await expect(
      page.getByRole('button', { name: 'Last two weeks' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabelText('From')).toHaveValue('2026-09-03');
    await expect(page.getByLabelText('To')).toHaveValue('2026-09-16');
    await userEvent.keyboard('{Escape}');
    await expect(
      page.getByRole('button', { name: 'Period' }),
    ).toHaveTextContent('Sep 3 – Sep 16, 2026 · Last two weeks');
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
    const page = await period(await chooseNorthwind(canvasElement));
    await userEvent.clear(page.getByLabelText('From'));
    await userEvent.type(page.getByLabelText('From'), '2026-09-05');
    await userEvent.keyboard('{Escape}');
    await chooseMeridian(canvasElement);
    await period(page);
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
    await period(page);
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
    const page = await period(await chooseNorthwind(canvasElement));
    await userEvent.clear(page.getByLabelText('From'));
    await userEvent.type(page.getByLabelText('From'), '2026-09-16');
    await settled(page);
    await expect(page.queryByText(/is billed/)).toBeNull();
  },
};

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

/** With the dock folded, the page is a US letter's width, 816px at
    most. */
export const Workspace: Story = {
  ...ClientChosen,
  ...wide,
  beforeEach: foldDock,
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
    await expect(width).toBeLessThanOrEqual(816);
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
    // The play's By project never answers; every other preview does.
    ...stalledWhen('previewInvoice', async (info) => {
      const body = (await info.request.clone().json()) as {
        groupingMode?: string;
      };
      return body.groupingMode === 'project';
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await pickGrouping(page, /By project/);
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
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
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

/** Northwind's last invoice ended Aug 15, so its work from then to the
    period is on no invoice. New invoice says so above the card. */
export const EarlierWork: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(
      await page.findByText(
        /^\d+ earlier entries, Aug \d+ – Aug 31, aren't on any invoice\.$/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Start from Aug \d+$/ }),
    ).toBeVisible();
  },
};
export const EarlierWorkPhone: Story = { ...EarlierWork, ...phone };

/** The client's ids of the work Aug 16 – 31, the gap after its last invoice. */
const strays = (db: Db) => {
  const northwind = new Set(
    db.projects.filter((p) => p.clientId === ids.northwind).map((p) => p.id),
  );
  return db.entries.filter(
    (e) =>
      northwind.has(e.projectId as string) &&
      e.isBillable &&
      e.invoiceId === null &&
      e.startedAt >= '2026-08-16' &&
      e.startedAt < '2026-09-01',
  );
};

/** One entry stranded: Start from moves From back to its day, the offer
    goes, and the card bills it. */
export const StartFromEarlierWork: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      const keep = strays(db).at(-1);
      for (const e of strays(db))
        if (e !== keep) db.entries.splice(db.entries.indexOf(e), 1);
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    const offer = await page.findByText(
      /^1 earlier entry, Aug 31, isn't on any invoice\.$/,
    );
    await settled(page);
    const before = due(page).getByText(/^\d+ entries/).textContent;
    await userEvent.click(
      page.getByRole('button', { name: 'Start from Aug 31' }),
    );
    await expect(offer).not.toBeInTheDocument();
    await period(page);
    await expect(page.getByLabelText('From')).toHaveValue('2026-08-31');
    await userEvent.keyboard('{Escape}');
    await settled(page);
    await waitFor(() =>
      expect(due(page).getByText(/^\d+ entries/).textContent).not.toBe(before),
    );
  },
};

/** Another client chosen over the same dates: Northwind's offer goes at
    once, before Meridian's answer, which here never lands. */
export const EarlierWorkLeavesWithClient: Story = {
  ...desktop,
  parameters: {
    a11y: skipping('aria-hidden-focus', 'color-contrast'),
    ...stalledWhen('previewInvoice', async (info) => {
      const body = (await info.request.clone().json()) as {
        clientId: string;
      };
      return body.clientId === ids.meridian;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await page.findByRole('button', { name: /^Start from/ });
    const range = page.getByRole('button', { name: 'Period' }).textContent;
    await chooseMeridian(canvasElement);
    await expect(
      page.getByRole('button', { name: 'Period' }),
    ).toHaveTextContent(range as string);
    await expect(
      page.queryByRole('button', { name: /^Start from/ }),
    ).toBeNull();
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
    const row = card(page)
      .getByRole('button', { name: /^Edit charge Hosting, September/ })
      .closest('tr') as HTMLElement;
    await expect(
      within(row)
        .getAllByRole('cell')
        .slice(1)
        .map((c) => c.textContent),
    ).toEqual(['1', '$400.00', '$400.00']);
  },
};

/** A reference is typed where it prints, under the service period, which
    labels it once filled (US4 scenario 1). */
export const WithReference: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await userEvent.type(
      page.getByLabelText('Reference'),
      'ICA dated Aug 5, 2026 · Exhibit A SOW',
    );
    await expect(card(page).getByText('Reference')).toBeVisible();
  },
};

/** A note is typed where it prints, which labels it once filled. */
export const WithNotes: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await expect(card(page).queryByText('Notes')).toBeNull();
    await userEvent.type(
      page.getByLabelText('Notes'),
      'Thanks for a great month.',
    );
    await expect(card(page).getByText('Notes')).toBeVisible();
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

/** Opens the page's number and saves `next`. STINT-0015 is the highest
    number an invoice holds. */
const saveNumber = async (
  page: ReturnType<typeof within>,
  shown: string,
  next: string,
) => {
  const form = await openDates(page, shown);
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

/** The number Generate takes prints before it does. Pressing it moves it
    in a dialog, so the draft being built stays as it was. */
export const ChangeNumber: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const { page } = await changeNumber(canvasElement, '20');
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(
      card(page).getByRole('button', { name: /^Edit No\. STINT-0020/ }),
    ).toBeVisible();
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
    await expect(
      card(page).getByRole('button', { name: /^Edit No\. STINT-0016/ }),
    ).toBeVisible();
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

/** Template shows the account's by name and opens a dialog to pick
    another: choosing swaps the large sample in place, with no dialog over
    it, and Save keeps it in Settings. The draft being built stays as it
    was. */
export const ChangeTemplate: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await userEvent.type(page.getByLabelText('Reference'), 'PO-7');
    const template = page.getByRole('button', { name: 'Template' });
    await expect(template).toHaveTextContent('Standard');
    await userEvent.click(template);
    const dialog = await page.findByRole('dialog', {
      name: 'Invoice template',
    });
    await waitFor(() => expect(dialog).toBeVisible());
    const form = within(dialog);
    await expect(
      form.getByRole('img', { name: 'A sample invoice in Standard' }),
    ).toBeVisible();
    await expect(form.queryByRole('button', { name: /^Preview/ })).toBeNull();
    await userEvent.click(form.getByRole('radio', { name: 'Classic' }));
    await expect(
      form.getByRole('img', { name: 'A sample invoice in Classic' }),
    ).toBeVisible();
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(template).toHaveTextContent('Classic');
    await expect(page.getByLabelText('Reference')).toHaveValue('PO-7');
  },
};
export const ChangeTemplatePhone: Story = { ...ChangeTemplate, ...phone };

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
      page.getByLabelText('Summary line'),
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
    await expect(await page.findByLabelText('Summary line')).toHaveValue(
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

/** The client's last invoice was by task under a PO, so this one opens by
    task under that PO. */
export const FromLastByTask: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      const last = db.invoices
        .filter((i) => i.clientId === ids.northwind && i.status !== 'void')
        .sort(
          (a, b) => b.sequenceNo - a.sequenceNo,
        )[0] as Db['invoices'][number];
      last.reference = 'PO 4471';
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await expect(
      page.getByRole('button', { name: 'Show time as' }),
    ).toHaveTextContent('By task');
    await expect(page.getByLabelText('Reference')).toHaveValue('PO 4471');
  },
};

/** Until the client's invoices answer, its format is unknown, so neither
    the grouping nor a summary line shows, rather than one that flips. */
export const FormatLoading: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...stalled('invoices'),
    // The last invoice and the open drafts both read the list.
    stalls: 2,
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    // Past the 400ms the form takes to settle.
    await new Promise((r) => setTimeout(r, 600));
    await expect(
      page.queryByRole('button', { name: 'Show time as' }),
    ).toBeNull();
    await expect(page.queryByLabelText('Summary line')).toBeNull();
    await expect(
      page.queryByText('Give the summary line its text.'),
    ).toBeNull();
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
  },
};

/** A client never invoiced opens on one summary line, its text started
    in the field for the user to keep or change. */
export const FirstInvoice: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      db.invoices = db.invoices.filter((i) => i.clientId !== ids.northwind);
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(await page.findByLabelText('Summary line')).toHaveValue(
      'Contracting services',
    );
    await expect(
      page.getByRole('button', { name: 'Show time as' }),
    ).toHaveTextContent('One summary line');
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
      await card(page).findByRole('button', {
        name: /^Edit Figma license, annual/,
      }),
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
      card(page).getByRole('button', { name: /^Edit Figma license, annual/ }),
    ).toBeVisible();
    await expect(card(page).queryByText('Services')).toBeNull();
    // The figure is expenses alone, and the count says so.
    await expect(due(page).getByText(/^\d+ expenses?$/)).toBeVisible();
  },
};

/** Unticking one asks the server again and leaves it off the bill, faint
    on the page, in its place, so it can be ticked again. */
export const UntickExpense: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    const total = due(page).getByText(/^\$[\d,]+\.\d\d$/).textContent;
    const tick = page.getByRole('checkbox', {
      name: 'Bill Figma license, annual',
    });
    const order = () =>
      card(page)
        .getAllByRole('checkbox')
        .map((c) => c.getAttribute('aria-label'));
    const before = order();
    await userEvent.click(tick);
    await settled(page);
    await expect(tick).not.toBeChecked();
    await expect(due(page).getByText(/^\$[\d,]+\.\d\d$/).textContent).not.toBe(
      total,
    );
    // It stays where it was, not at the bottom once the answer lands.
    await expect(order()).toEqual(before);
  },
};

/** A one-off another draft holds is that draft's: Byrne's August draft
    holds its stock photography, so a new invoice doesn't offer it. */
export const HeldByAnotherDraft: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Client' }));
    await userEvent.click(
      await page.findByRole('menuitemradio', { name: /Byrne/ }),
    );
    await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
    await settled(page);
    await expect(
      card(page).queryByRole('checkbox', { name: 'Bill Stock photography' }),
    ).toBeNull();
  },
};

/** Before the server's first answer, everything the user edits on the page
    is there: the summary line, the expense ticks and both Add buttons. */
export const EditsBeforeFigures: Story = {
  ...desktop,
  parameters: { ...menuOpen, ...stalled('previewInvoice') },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await pickGrouping(page, /One summary line/);
    await expect(await page.findByLabelText('Summary line')).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Bill Figma license, annual' }),
    ).toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Add a charge' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add an expense' }),
    ).toBeVisible();
  },
};

/** Before the server's first answer an empty page is not yet "nothing to
    bill": it says nothing until the answer does. */
export const NothingYet: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...stalled('previewInvoice'),
    ...account((db) => {
      db.expenses = [];
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(
      await page.findByRole('button', { name: 'Add a charge' }),
    ).toBeVisible();
    await expect(
      card(page).queryByText('Nothing to bill in this period.'),
    ).toBeNull();
  },
};

/** No time, no expense and no charge: the page says so, and Generate
    waits, since the draft could never be sent. */
export const NothingToBill: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      for (const e of db.entries) e.isBillable = false;
      db.expenses = [];
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    // The answer has landed once the page says so; Generate never enables.
    await expect(
      await card(page).findByText('Nothing to bill in this period.'),
    ).toBeVisible();
    await expect(await due(page).findByText('0 entries')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate invoice' }),
    ).toBeDisabled();
  },
};

/** One summary line with no hours to bill still has its field: the server
    refuses a summary invoice without its text. */
export const SummaryWithoutHours: Story = {
  ...OnlyExpenses,
  play: async ({ canvasElement }) => {
    const page = await summaryFor(canvasElement, 'Retainer');
    await settled(page);
    await expect(page.getByLabelText('Summary line')).toHaveValue('Retainer');
  },
};

/** Switching clients, the last client's lines leave with it: none of its
    figures sits under the new Bill to while that client loads. */
export const SwitchingClients: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    // Meridian's last invoice never answers; every other does.
    ...stalledWhen(
      'invoices',
      (info) =>
        new URL(info.request.url).searchParams.get('clientId') === ids.meridian,
    ),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await chooseMeridian(canvasElement);
    await card(page).findByRole('button', { name: /^Edit Bill to Meridian/ });
    await expect(card(page).queryByText('Subtotal')).toBeNull();
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
      await card(page).findByRole('button', {
        name: /^Edit Claude Max subscription/,
      }),
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

/** Bill to is what the invoice prints for the client, and opens the
    client's own dialog; once it saves, the page shows what the server kept.
    A client with no address or email prints its name alone. */
export const EditClientHere: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseMeridian(canvasElement);
    const billTo = await card(page).findByRole('button', {
      name: /^Edit Bill to/,
    });
    await expect(billTo).toHaveAccessibleName('Edit Bill to Meridian Labs');
    await userEvent.click(billTo);
    const dialog = within(await page.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Email'), 'ap@meridian.test');
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(billTo).toHaveAccessibleName(
        'Edit Bill to Meridian Labs ap@meridian.test',
      ),
    );
  },
};

/** "+ Add a charge" asks for a description and an amount, which shows the
    invoice's currency; Save with neither marks both and moves to the first
    (US5 scenario 3). */
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
    await expect(dialog.getByText('$')).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
    const description = dialog.getByRole('textbox', { name: /Description/ });
    await expect(description).toHaveFocus();
    await expect(description).toHaveAccessibleDescription(/^Say what/);
    await expect(
      dialog.getByRole('textbox', { name: /Amount/ }),
    ).toHaveAccessibleDescription(/^Enter an amount/);
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
      await card(page).findByRole('button', { name: /^Edit Payment/ }),
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
    // Generate is never there to press before Due can be filled.
    await expect(
      region.queryByRole('button', { name: /generate/i }),
    ).toBeNull();
  },
};

const noSender = account((db: Db) => {
  db.settings.businessName = null;
  db.settings.businessEmail = null;
});

/** No business name or email: the notice says so, Generate waits, and the
 *  page marks where the sender prints, with a hint under it. */
export const DetailsMissing: Story = {
  ...desktop,
  parameters: noSender,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await expect(
      await page.findByText('Your business details are missing'),
    ).toBeVisible();
    await expect(
      card(page).getByRole('button', { name: 'Add your business' }),
    ).toBeVisible();
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
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await expect(
      form.getByRole('textbox', { name: /Business name/ }),
    ).toHaveFocus();
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
    await expect(card(page).getByText('Sam Rivera Consulting')).toBeVisible();
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
    await userEvent.type(
      form.getByRole('textbox', { name: /Email/ }),
      'sam@lakeline.test',
    );
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await expect(await form.findByText('Enter a valid email.')).toBeVisible();
    await expect(
      form.getByRole('textbox', { name: /Business name/ }),
    ).toHaveValue('Sam Rivera Consulting');
  },
};

// ── leaving ────────────────────────────────────────────────────────

/** Presses the rail's Calendar, and returns the dialog that asks. */
const asked = async (page: Page) => {
  await userEvent.click(
    within(page.getByRole('navigation', { name: 'Sections' })).getByRole(
      'link',
      { name: 'Calendar' },
    ),
  );
  const dialog = await page.findByRole('dialog', {
    name: 'Save this invoice as a draft?',
  });
  await waitFor(() => expect(dialog).toBeVisible());
  return within(dialog);
};

/** Leaving with changes asks, and Keep editing keeps the form as it was. */
export const LeavingAsks: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    const dialog = await asked(page);
    await expect(getRouter().push).not.toHaveBeenCalled();
    await expect(dialog.getByRole('button', { name: 'Discard' })).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(
      page.getByRole('button', { name: 'Client' }),
    ).toHaveTextContent(/Northwind/);
  },
};

/** Discard goes where the link pointed, and nothing is saved. */
export const LeavingDiscards: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    const before = getDb().invoices.length;
    const dialog = await asked(page);
    await userEvent.click(dialog.getByRole('button', { name: 'Discard' }));
    await expect(getRouter().push).toHaveBeenCalledWith('/calendar');
    await expect(getDb().invoices.length).toBe(before);
  },
};

/** Save draft makes the draft, then goes where the link pointed. A first
    invoice saves on its started summary line. */
export const LeavingSaves: Story = {
  ...desktop,
  parameters: {
    ...menuOpen,
    ...account((db) => {
      db.invoices = db.invoices.filter((i) => i.clientId !== ids.northwind);
    }),
  },
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    const before = getDb().invoices.length;
    const dialog = await asked(page);
    await userEvent.click(dialog.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(getDb().invoices.length).toBe(before + 1));
    await expect(getDb().invoices.at(-1)?.summaryText).toBe(
      'Contracting services',
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith('/calendar'),
    );
    await expect(getRouter().push).toHaveBeenCalledTimes(1);
  },
};

/** A form that can't be saved yet says why, and Save draft waits. */
export const LeavingBlocked: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await summaryFor(canvasElement, '');
    const dialog = await asked(page);
    await expect(
      dialog.getByText(
        /It can't be saved yet: give the summary line its text\./,
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Save draft' }),
    ).toBeDisabled();
  },
};

/** Your business, atop the page, opens the same dialog, filled from
 *  Settings: correcting it reprints the preview and leaves the draft as it
 *  was. */
export const EditSender: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await chooseNorthwind(canvasElement);
    await settled(page);
    await userEvent.type(page.getByLabelText('Reference'), 'PO-7');
    await userEvent.click(
      card(page).getByRole('button', { name: /^Edit Sam Rivera/ }),
    );
    const dialog = await page.findByRole('dialog', {
      name: 'Who is this invoice from?',
    });
    await waitFor(() => expect(dialog).toBeVisible());
    const form = within(dialog);
    const email = form.getByRole('textbox', { name: /Email/ });
    await expect(email).toHaveValue('billing@samrivera.test');
    await userEvent.clear(email);
    await userEvent.type(email, 'sam@samrivera.test');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(
      await card(page).findByText(/sam@samrivera\.test/),
    ).toBeVisible();
    await expect(page.getByLabelText('Reference')).toHaveValue('PO-7');
  },
};
export const EditSenderPhone: Story = { ...EditSender, ...phone };
