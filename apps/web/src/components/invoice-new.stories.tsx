import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { account } from '@/mocks/db';
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

const previewFor = async (canvasElement: HTMLElement, charge?: string) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: 'Client' }));
  await userEvent.click(
    await page.findByRole('menuitemradio', { name: /Northwind/ }),
  );
  if (charge) {
    await userEvent.click(
      await page.findByRole('button', { name: /Add a charge/ }),
    );
    await userEvent.type(
      page.getByRole('textbox', { name: 'Charge 1 description' }),
      charge,
    );
    await userEvent.type(
      page.getByRole('textbox', { name: 'Charge 1 amount' }),
      '400',
    );
  }
  await userEvent.click(await page.findByRole('button', { name: 'Preview' }));
  return page;
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
    const page = await previewFor(canvasElement);
    await expect(await page.findByText(/no rate/i)).toBeVisible();
  },
};

/** A charge is a flat amount: no quantity, no rate, after the time lines. */
export const WithCharge: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = await previewFor(canvasElement, 'Hosting, September');
    await expect(
      await page.findByRole('cell', { name: 'Hosting, September' }),
    ).toBeVisible();
  },
};
