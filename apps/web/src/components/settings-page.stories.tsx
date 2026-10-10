import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
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

/** No save button: every field is a default, saved as it changes. One
    payment profile is the default, and only the other offers Make default. */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const heading = await within(canvasElement).findByRole('heading', {
      name: 'Payment details',
    });
    const payment = within(heading.closest('section') as HTMLElement);
    const rows = await payment.findAllByRole('listitem');
    const row = (name: string) =>
      within(rows.find((r) => r.textContent?.includes(name)) as HTMLElement);
    await expect(row('Business checking').getByText('Default')).toBeVisible();
    await expect(payment.getAllByText('Default')).toHaveLength(1);
    await expect(
      row('International wire').getByRole('button', { name: 'Make default' }),
    ).toBeVisible();
    await expect(
      payment.getAllByRole('button', { name: 'Make default' }),
    ).toHaveLength(1);
  },
};
export const Phone: Story = { ...phone };
/** The form's theme hook must not restamp the toolbar's light theme. */
export const Light: Story = {
  ...light,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('combobox', { name: 'Theme' });
    await expect(canvasElement.ownerDocument.documentElement).toHaveAttribute(
      'data-theme',
      'light',
    );
  },
};

/** No payment details: invoices render without a payment block. */
export const NoPaymentProfiles: Story = {
  ...desktop,
  parameters: account((db) => {
    db.paymentProfiles = [];
  }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        /Invoices will render without a payment block/,
      ),
    ).toBeVisible();
  },
};

export const Failed: Story = { ...desktop, parameters: failing('settings') };

/** Theme offers System, which follows the OS, beside Dark and Light. */
export const ThemeOptions: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('combobox', { name: 'Theme' }));
    const options = await page.findAllByRole('option');
    await expect(options.map((o) => o.textContent)).toEqual([
      'System',
      'Dark',
      'Light',
    ]);
    await userEvent.keyboard('{Escape}');
  },
};

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

/** Sign out sits beside Delete account, and is pending until the page
    leaves for /signin; Delete account waits with it. */
export const SignOutPending: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Sign out' }),
    );
    await expect(
      await page.findByRole('button', { name: 'Signing out…' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Delete account' }),
    ).toBeDisabled();
  },
};

/** Payment details: US bank rails first, international additive. */
export const AddPaymentDetails: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: /Add payment details/ }),
    );
    await expectOpen(canvasElement, 'dialog');
  },
};

/** A refused "Make default" is said in the notice, naming the profile. */
export const MakeDefaultRefused: Story = {
  ...desktop,
  parameters: failing('updatePaymentProfile'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: /Make default/ }),
    );
    await expect(
      await page.findByText(/Couldn’t make .+ the default/),
    ).toBeVisible();
  },
};

/** All or nothing: a failed delete says nothing was removed. */
export const DeleteAccountFailed: Story = {
  ...desktop,
  parameters: failing('deleteAccount'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: /Delete account/ }),
    );
    await userEvent.type(
      await page.findByRole('textbox', { name: /Type your email/ }),
      'dev@localhost.test',
    );
    await userEvent.click(
      page.getByRole('button', { name: 'Delete account and data' }),
    );
    await expect(await page.findByText(/nothing was removed/i)).toBeVisible();
  },
};
