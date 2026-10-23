import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { account } from '@/mocks/db';
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
export const Light: Story = { ...light };

/** A draft not yet downloaded has no number, so its row says Draft. */
export const UnnumberedDraft: Story = {
  ...desktop,
  parameters: account((db) => {
    const draft = db.invoices.find((i) => i.status === 'draft');
    if (draft) Object.assign(draft, { invoiceNumber: null, sequenceNo: null });
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText('Draft', { selector: 'span' }),
    ).toBeVisible();
  },
};

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
