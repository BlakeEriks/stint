import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account, getDb } from '@/mocks/db';
import { id } from '@/mocks/fixtures';
import { desktop, phone, screen } from '@/mocks/screen';
import { EditInvoice } from './invoice-new';

/* Byrne Studio's draft, STINT-0015: August. */
const draft = id(315);

const meta = {
  title: 'Screens/Invoices/Edit',
  component: EditInvoice,
  ...screen(`/invoices/${draft}/edit`),
  args: { id: draft },
} satisfies Meta<typeof EditInvoice>;

export default meta;
type Story = StoryObj<typeof meta>;

const saved = async (page: ReturnType<typeof within>) =>
  waitFor(
    () =>
      expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled(),
    { timeout: 3000 },
  );

/** New invoice, opened on the draft: every field as the draft left it, and
    the client locked. Its number stays, so none is offered. */
export const Filled: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole('heading', { name: 'Edit STINT-0015' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Client' })).toBeDisabled();
    await expect(page.getByLabelText('From')).toHaveValue('2026-08-01');
    await expect(page.getByLabelText('To')).toHaveValue('2026-08-31');
    await expect(page.queryByText(/^Numbered/)).toBeNull();
    await expect(page.queryByText(/A draft already covers/)).toBeNull();
    await expect(page.getByText('Saving keeps its number.')).toBeVisible();
    await saved(page);
  },
};
export const FilledPhone: Story = { ...Filled, ...phone };

/** Saving writes what was changed onto the same draft. */
export const SavesDates: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const to = await page.findByLabelText('To');
    await userEvent.clear(to);
    await userEvent.type(to, '2026-09-15');
    await userEvent.type(page.getByLabelText('Reference'), 'PO-88');
    await saved(page);
    await userEvent.click(page.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      const stored = getDb().invoices.find((i) => i.id === draft);
      expect(stored?.periodEnd).toBe('2026-09-15');
      expect(stored?.reference).toBe('PO-88');
      expect(stored?.invoiceNumber).toBe('STINT-0015');
    });
  },
};

/** Onto another draft's dates: the form names that draft and holds Save. */
export const OverlapsDraft: Story = {
  ...desktop,
  parameters: account((db) => {
    const august = db.invoices.find((i) => i.id === draft);
    if (!august) return;
    db.invoices.push({
      ...august,
      id: id(399),
      invoiceNumber: 'STINT-0016',
      sequenceNo: 16,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const to = await page.findByLabelText('To');
    await userEvent.clear(to);
    await userEvent.type(to, '2026-09-10');
    await expect(
      await page.findByRole('link', { name: 'STINT-0016' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save draft' }),
    ).toBeDisabled();
  },
};

/** Sent since: only a draft is edited, so the form doesn't open. */
export const Issued: Story = {
  ...desktop,
  parameters: account((db) => {
    const august = db.invoices.find((i) => i.id === draft);
    if (august) august.status = 'sent';
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByText(/STINT-0015 is sent, and only a draft/),
    ).toBeVisible();
    await expect(page.queryByRole('button', { name: 'Save draft' })).toBeNull();
  },
};
