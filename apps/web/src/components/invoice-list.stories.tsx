import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { account } from '@/mocks/db';
import {
  at,
  desktop,
  failing,
  light,
  phone,
  screen,
  expectOpen,
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

/** An empty filter never claims the account is empty. */
export const NothingOpen: Story = {
  ...desktop,
  parameters: account((db) => {
    for (const i of db.invoices)
      if (i.status === 'sent' || i.status === 'draft') i.status = 'paid';
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText(/Nothing open/)).toBeVisible();
    await expect(page.queryByText(/No invoices yet/)).toBeNull();
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
