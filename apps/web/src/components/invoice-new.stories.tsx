import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, menuOpen, phone, screen } from '@/mocks/screen';
import { NewInvoice } from './invoice-new';

const meta = {
  title: 'Screens/Invoices/New',
  component: NewInvoice,
  ...screen('/invoices/new'),
} satisfies Meta<typeof NewInvoice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A client and a period, defaulting to last month. */
export const Blank: Story = { ...desktop };
export const Phone: Story = { ...phone };

/** The preview is exactly what generating writes. */
export const Previewed: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Client' }));
    await userEvent.click(
      await page.findByRole('menuitemradio', { name: /Northwind/ }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Preview' }));
    await expect(
      await page.findByRole('button', { name: /Generate/ }),
    ).toBeVisible();
  },
};
