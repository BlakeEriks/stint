import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { id, ids } from '@/mocks/fixtures';
import { desktop, expectOpen, phone, screen } from '@/mocks/screen';
import { ClientDetail } from './client-detail';

const meta = {
  title: 'Screens/Clients/Detail',
  component: ClientDetail,
  ...screen(`/clients/${ids.northwind}`),
  args: { id: ids.northwind },
} satisfies Meta<typeof ClientDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Everything set: rate, tax, address, a payment profile, two projects. */
export const Desktop: Story = { ...desktop };
export const Phone: Story = { ...phone };

/** An unset rate reads "Not set" with a hint, never a zero. */
export const InheritsRate: Story = { ...desktop, args: { id: ids.meridian } };

/** Past invoices still reference it, so it is archived, never deleted. */
export const Archived: Story = {
  ...desktop,
  args: { id: ids.oldEngagement },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    // A finished engagement: its projects still show, and nothing is added.
    await page.findByText('Legacy retainer');
    await expect(
      page.queryByRole('button', { name: /Add project/ }),
    ).toBeNull();
  },
};

export const Missing: Story = { ...desktop, args: { id: id(199) } };

/** A project is added from its client, in a dialog. */
export const AddProject: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: /Add project/ }),
    );
    await expectOpen(canvasElement, 'dialog');
  },
};

/** Edit opens a dialog over the page. */
export const EditClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Edit' }));
    await expectOpen(canvasElement, 'dialog', 'Edit client');
    await expect(page.getByLabelText(/Name/)).toHaveValue('Northwind Trading');
  },
};
