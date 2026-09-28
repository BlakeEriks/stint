import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { account } from '@/mocks/db';
import {
  desktop,
  failing,
  light,
  phone,
  screen,
  expectOpen,
} from '@/mocks/screen';
import { SettingsPage } from './settings-page';

const meta = {
  title: 'Screens/Settings',
  component: SettingsPage,
  ...screen('/settings'),
} satisfies Meta<typeof SettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No save button: every field is a default, saved as it changes. */
export const Desktop: Story = { ...desktop };
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** No payment details: invoices render without a payment block. */
export const NoPaymentProfiles: Story = {
  ...desktop,
  parameters: account((db) => {
    db.paymentProfiles = [];
  }),
};

export const Failed: Story = { ...desktop, parameters: failing('settings') };

/** Deleting the account counts what goes, and the email typed is the gate. */
export const DeleteAccount: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: /Delete account/ }),
    );
    await expectOpen(canvasElement, 'dialog');
  },
};
