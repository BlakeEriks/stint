import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { id } from '@/mocks/fixtures';
import { desktop, phone, screen, stalled } from '@/mocks/screen';
import { InvoiceDetail } from './invoice-detail';

/* Each status offers its own actions: a draft is deleted or sent, an issued
   invoice voided, and Download is there in every status. */
const invoice = (seq: number) => id(300 + seq);

const meta = {
  title: 'Screens/Invoices/Detail',
  component: InvoiceDetail,
  ...screen(`/invoices/${invoice(15)}`),
  args: { id: invoice(15) },
} satisfies Meta<typeof InvoiceDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = { ...desktop };
export const DraftPhone: Story = { ...phone };
export const Sent: Story = { ...desktop, args: { id: invoice(14) } };
export const Overdue: Story = { ...desktop, args: { id: invoice(13) } };
export const Paid: Story = { ...desktop, args: { id: invoice(12) } };
export const Void: Story = { ...desktop, args: { id: invoice(9) } };
export const Missing: Story = { ...desktop, args: { id: invoice(99) } };

/** The first press of a destructive pair only asks; the second names it. */
const press =
  (first: string, then?: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const page = within(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: first }));
    if (then) await userEvent.click(page.getByRole('button', { name: then }));
  };

export const ConfirmDelete: Story = {
  ...desktop,
  play: async (ctx) => {
    await press('Delete draft')(ctx);
    await expect(
      within(ctx.canvasElement).getByRole('button', {
        name: 'Delete STINT-0015 for good',
      }),
    ).toBeVisible();
  },
};

export const Deleting: Story = {
  ...desktop,
  parameters: stalled('deleteInvoice'),
  play: async (ctx) => {
    await press('Delete draft', 'Delete STINT-0015 for good')(ctx);
    await expect(
      await within(ctx.canvasElement).findByRole('button', {
        name: 'Deleting…',
      }),
    ).toBeDisabled();
  },
};

export const ConfirmVoid: Story = {
  ...desktop,
  args: { id: invoice(14) },
  play: async (ctx) => {
    await press('Void')(ctx);
    await expect(
      within(ctx.canvasElement).getByRole('button', {
        name: 'Void STINT-0014',
      }),
    ).toBeVisible();
  },
};

export const Voiding: Story = {
  ...desktop,
  args: { id: invoice(14) },
  parameters: stalled('updateInvoiceStatus'),
  play: async (ctx) => {
    await press('Void', 'Void STINT-0014')(ctx);
    await expect(
      await within(ctx.canvasElement).findByRole('button', {
        name: 'Voiding…',
      }),
    ).toBeDisabled();
  },
};

/** A fixed charge prints as 1 x its amount, so its row checks like the rest. */
export const WithCharge: Story = {
  ...desktop,
  parameters: account((db) => {
    const draft = db.invoices.find((i) => i.id === invoice(15));
    if (!draft) return;
    draft.lineItems.push({
      id: id(5999),
      sortOrder: draft.lineItems.length,
      description: 'Hosting, August',
      unit: 'fixed',
      quantity: 1,
      unitPrice: 400,
      amount: 400,
      spentOn: null,
    });
    draft.subtotal += 400;
    draft.total += 400;
  }),
};

/** Expenses print after the services with their own subtotal. */
export const WithExpenses: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByText('Stock photography')).toBeVisible();
    await expect(page.getAllByText('Expenses').length).toBeGreaterThan(0);
  },
};

/** A summary invoice names the detail it carries from page 2 (US2
    scenario 8). */
export const WithSupportingDetail: Story = {
  ...desktop,
  parameters: account((db) => {
    const draft = db.invoices.find((i) => i.id === invoice(15));
    if (!draft) return;
    draft.groupingMode = 'summary';
    draft.summaryText = 'Software consulting services';
    draft.supportingDetail = {
      project: [{ project: 'Warehouse dashboard', hours: 12 }],
      week: [{ start: '2026-08-03', end: '2026-08-09', hours: 12 }],
      totalHours: 12,
    };
  }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'Supporting detail from page 2: Hours by project, Hours by week',
      ),
    ).toBeVisible();
  },
};
