import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { id } from '@/mocks/fixtures';
import {
  at,
  desktop,
  expectOpen,
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

/** Open by default: drafts and sent. Outstanding counts sent only, and only
    a sent row can be marked paid. Nothing destructive: voiding stays on the
    invoice itself, where the whole document is in view. */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findAllByRole('button', { name: /paid/i });
    for (const forbidden of [/void/i, /delete/i])
      await expect(
        page.queryAllByRole('button', { name: forbidden }),
      ).toHaveLength(0);
  },
};
export const Phone: Story = { ...phone };

/** Scrolled to the end, the title, the filters and the outstanding figure
    are still at the panel's top. */
export const Scrolled: Story = {
  ...desktop,
  // Enough open rows that the panel scrolls at this height.
  parameters: account((db) => {
    const sent = db.invoices.filter((i) => i.status === 'sent');
    for (let n = 0; n < 20; n++) {
      const copy = sent[n % sent.length]!;
      db.invoices.push({
        ...copy,
        id: id(600 + n),
        sequenceNo: 900 + n,
        invoiceNumber: `STINT-0${900 + n}`,
      });
    }
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByText('STINT-0919');
    const title = page.getByRole('heading', { name: 'Invoices', level: 1 });
    const scroller = canvasElement.querySelector<HTMLElement>(
      '[data-content-scroller]',
    )!;
    const panel = canvasElement.querySelector('[data-content-panel]')!;
    scroller.scrollTop = scroller.scrollHeight;
    await waitFor(() => {
      expect(scroller.scrollTop).toBeGreaterThan(100);
      const below =
        title.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      expect(below).toBeGreaterThanOrEqual(0);
      expect(below).toBeLessThan(40);
    });
    await expect(
      page.getByRole('navigation', { name: 'Filter' }),
    ).toBeVisible();
    await expect(page.getByText('outstanding')).toBeVisible();
  },
};
export const Light: Story = { ...light };

export const Paid: Story = {
  ...desktop,
  parameters: at('/invoices', { status: 'paid' }),
};
/** Everything, void struck through. */
export const All: Story = {
  ...desktop,
  parameters: at('/invoices', { status: 'all' }),
};

/** An empty filter never claims the account is empty: it counts what the
    other filters hold. */
export const NothingOpen: Story = {
  ...desktop,
  parameters: account((db) => {
    for (const i of db.invoices)
      if (i.status === 'sent' || i.status === 'draft') i.status = 'paid';
  }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        /^Nothing open\. \d+ paid · 1 void\.$/,
      ),
    ).toBeVisible();
    await expect(
      within(canvasElement).queryByText(/No invoices yet/),
    ).toBeNull();
  },
};
export const NothingPaid: Story = {
  ...desktop,
  parameters: {
    ...at('/invoices', { status: 'paid' }),
    ...account((db) => {
      for (const i of db.invoices) if (i.status === 'paid') i.status = 'sent';
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/^Nothing paid\. .*\d+ sent/),
    ).toBeVisible();
  },
};
export const Empty: Story = { ...desktop, parameters: account('empty') };
export const Failed: Story = { ...desktop, parameters: failing('invoices') };

/** Marking paid asks for the date it arrived. */
export const MarkPaid: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [paid] = await page.findAllByRole('button', { name: /paid/i });
    await userEvent.click(paid as HTMLElement);
    await expectOpen(canvasElement, 'dialog');
  },
};

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
