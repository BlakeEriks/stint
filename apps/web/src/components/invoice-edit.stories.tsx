import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getRouter } from '@storybook/nextjs-vite/navigation.mock';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account, getDb } from '@/mocks/db';
import { id } from '@/mocks/fixtures';
import { desktop, screen } from '@/mocks/screen';
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

/** New invoice, opened on the draft: everything as the draft left it, the
    client locked and the business plain. Its number stays, so none is
    offered. */
export const Filled: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole('heading', { name: 'Edit STINT-0015' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Client' })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Period' }),
    ).toHaveTextContent('Aug 1 – Aug 31, 2026');
    await saved(page);
    // Its sender was frozen when it was made, so Settings can't reach it.
    await expect(
      page.queryByRole('button', { name: /^Edit Sam Rivera/ }),
    ).toBeNull();
    // Its dates open with the number shown, not offered.
    await userEvent.click(page.getByRole('button', { name: /^Edit No\./ }));
    const dialog = within(
      await page.findByRole('dialog', { name: 'Number and dates' }),
    );
    await expect(dialog.getByText('STINT-0015')).toBeVisible();
    await expect(dialog.queryByLabelText('Next number')).toBeNull();
    await userEvent.keyboard('{Escape}');
  },
};

/** Saving writes what was changed onto the same draft. */
export const SavesDates: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Period' }));
    const to = await page.findByLabelText('To');
    await userEvent.clear(to);
    await userEvent.type(to, '2026-09-15');
    await userEvent.keyboard('{Escape}');
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

/** Leaving with changes asks; Save draft saves them, then goes where the
    link pointed. */
export const LeavingSaves: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByLabelText('Reference'), 'PO-88');
    await saved(page);
    await userEvent.click(
      within(page.getByRole('navigation', { name: 'Sections' })).getByRole(
        'link',
        { name: 'Calendar' },
      ),
    );
    const dialog = within(
      await page.findByRole('dialog', { name: 'Save changes to STINT-0015?' }),
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith('/calendar'),
    );
    await expect(getRouter().push).toHaveBeenCalledTimes(1);
    await expect(getDb().invoices.find((i) => i.id === draft)?.reference).toBe(
      'PO-88',
    );
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
