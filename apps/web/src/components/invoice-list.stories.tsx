import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { id } from '@/mocks/fixtures';
import {
  desktop,
  expectTitlePinned,
  failing,
  light,
  phone,
  screen,
  stalled,
} from '@/mocks/screen';
import { InvoiceList } from './invoice-list';

const meta = {
  title: 'Screens/Invoices',
  component: InvoiceList,
  ...screen('/invoices'),
} satisfies Meta<typeof InvoiceList>;

export default meta;
type Story = StoryObj<typeof meta>;

/* The page's own content: the dock's Inbox has headings and Mark paid
   buttons of its own on every route. */
const main = (canvas: HTMLElement) =>
  within(canvas.querySelector('main') as HTMLElement);

const headings = (canvas: HTMLElement) =>
  main(canvas)
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent);

const money = (text: string | null | undefined) =>
  Number((text ?? '').replace(/[^0-9.]/g, ''));

/** A section's total: the last thing in its heading. */
const total = (section: HTMLElement) =>
  money(within(section).getByRole('heading').lastElementChild?.textContent);

/** Drafts, then awaiting payment, then the year with its void. Each
    section's name says the status, so only the void wears a badge; a
    section of one row shows no total, which would repeat it. */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    await page.findByRole('region', { name: 'Drafts' });
    await expect(headings(canvasElement)).toEqual([
      'Drafts',
      expect.stringMatching(/^Awaiting payment\$[\d,.]+$/),
      expect.stringMatching(/^Paid in 20267 paid · 1 void\$[\d,.]+$/),
    ]);
    await expect(page.getByText('void', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mark sent, STINT-0015' }),
    ).toBeVisible();
    await expect(
      page.getAllByRole('button', { name: /^Mark paid/ }),
    ).toHaveLength(2);
  },
};

/** One row each: neither open heading repeats its row's amount. */
export const OneOpenEach: Story = {
  ...desktop,
  parameters: account((db) => {
    db.invoices = db.invoices.filter((i) => i.sequenceNo !== 14);
  }),
  play: async ({ canvasElement }) => {
    await main(canvasElement).findByRole('region', { name: 'Drafts' });
    await expect(headings(canvasElement).slice(0, 2)).toEqual([
      'Drafts',
      'Awaiting payment',
    ]);
  },
};

/** Nothing open: one quiet line, then the year. */
export const NothingOpen: Story = {
  ...desktop,
  parameters: account((db) => {
    db.invoices = db.invoices.filter(
      (i) => i.status !== 'draft' && i.status !== 'sent',
    );
  }),
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    await expect(
      await page.findByText(
        (_, el) =>
          el?.tagName === 'P' &&
          /^Nothing open · Last paid Sep 5, \$[\d,.]+ from Meridian Labs$/.test(
            el.textContent ?? '',
          ),
      ),
    ).toBeVisible();
    await expect(headings(canvasElement)).toEqual([
      expect.stringMatching(/^Paid in 2026/),
    ]);
  },
};

/** Two years of history, the newest first. */
export const TwoYears: Story = {
  ...desktop,
  parameters: account((db) => {
    for (const i of db.invoices.filter((i) => i.sequenceNo <= 7)) {
      i.issueDate = i.issueDate.replace('2026', '2025');
      i.paidAt = i.paidAt?.replace('2026', '2025') ?? null;
    }
  }),
  play: async ({ canvasElement }) => {
    await main(canvasElement).findByRole('region', { name: 'Paid in 2025' });
    await expect(
      headings(canvasElement).filter((h) => h?.startsWith('Paid')),
    ).toEqual([
      expect.stringMatching(/^Paid in 2026/),
      expect.stringMatching(/^Paid in 2025/),
    ]);
  },
};

export const Empty: Story = {
  ...desktop,
  parameters: account('empty'),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'No invoices yet. Preview a period to see what it would bill.',
      ),
    ).toBeVisible();
  },
};

/** The button under the amount, and the period on its own line with no
    dot leading it. */
export const Phone: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    const send = await page.findByRole('button', {
      name: 'Mark sent, STINT-0015',
    });
    const row = send.closest('li') as HTMLElement;
    const amount = within(row).getByText(/^\$/);
    await expect(send.getBoundingClientRect().top).toBeGreaterThan(
      amount.getBoundingClientRect().bottom,
    );
    await expect(
      within(row).getByText(/^August · Created Sep 5$/),
    ).toBeVisible();
  },
};

/** Paid from its row, it lands first in its year, and the year's total
    takes it in. */
export const MarkPaidConfirmed: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const page = main(canvasElement);
    const before = total(
      await page.findByRole('region', { name: 'Paid in 2026' }),
    );
    const press = page.getByRole('button', { name: 'Mark paid, STINT-0013' });
    const amount = money(
      within(press.closest('li') as HTMLElement).getByText(/^\$/).textContent,
    );

    await userEvent.click(press);
    await userEvent.click(
      await body.findByRole('button', { name: 'Mark paid' }),
    );

    await waitFor(
      () => {
        const year = page.getByRole('region', { name: 'Paid in 2026' });
        const [first] = within(year).getAllByRole('listitem');
        expect(first).toHaveTextContent('STINT-0013');
        expect(total(year)).toBeCloseTo(before + amount, 2);
      },
      { timeout: 4000 },
    );
  },
};

/** Scrolled to the end, the title stays at the panel's top. */
export const Scrolled: Story = {
  ...desktop,
  parameters: account((db) => {
    const paid = db.invoices.filter((i) => i.status === 'paid');
    for (let n = 0; n < 20; n++) {
      const copy = paid[n % paid.length]!;
      db.invoices.push({
        ...copy,
        id: id(600 + n),
        sequenceNo: 900 + n,
        invoiceNumber: `STINT-0${900 + n}`,
      });
    }
  }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('STINT-0919');
    await expectTitlePinned(canvasElement, 'Invoices');
  },
};

export const Light: Story = { ...light };
export const Failed: Story = { ...desktop, parameters: failing('invoices') };

/** On its way: one quiet word where it will be, and none of it until all of
 *  it has arrived. */
export const Loading: Story = {
  ...desktop,
  parameters: stalled('invoices'),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement.querySelector('main') as HTMLElement);
    await expect(await region.findByRole('status')).toHaveTextContent(
      'Loading',
    );
  },
};
