import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import {
  desktop,
  failing,
  light,
  phone,
  screen,
  stalled,
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
    await within(canvasElement).findByRole('radiogroup', { name: 'Theme' });
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

/** Appearance is one row: System, which follows the OS, Light and Dark,
    and a press applies the theme at once. */
export const ThemeOptions: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const group = await page.findByRole('radiogroup', { name: 'Theme' });
    const options = within(group).getAllByRole('radio');
    await expect(options.map((o) => o.getAttribute('aria-label'))).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
    const root = canvasElement.ownerDocument.documentElement;
    const before = root.getAttribute('data-theme');
    const other = before === 'light' ? 'Dark' : 'Light';
    await userEvent.click(within(group).getByRole('radio', { name: other }));
    await expect(root).toHaveAttribute('data-theme', other.toLowerCase());
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
  parameters: stalled('signOut'),
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

const exportSection = async (canvasElement: HTMLElement) => {
  const heading = await within(canvasElement).findByRole('heading', {
    name: 'Export',
  });
  return within(heading.closest('section') as HTMLElement);
};

/** Export sits after Import: both files, one press each. A press saves the
    file the server named, built from the account. */
export const ExportDownload: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const section = await exportSection(canvasElement);
    const saved: string[] = [];
    const click = spyOn(
      HTMLAnchorElement.prototype,
      'click',
    ).mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    await userEvent.click(
      section.getByRole('button', { name: 'Download entries' }),
    );
    await waitFor(() =>
      expect(saved).toEqual([
        expect.stringMatching(/^stint-entries-\d{4}-\d{2}-\d{2}\.csv$/),
      ]),
    );
    click.mockRestore();
    await expect(
      section.getByRole('button', { name: 'Download invoices' }),
    ).toBeEnabled();
  },
};

/** Downloading: the pressed button says it is preparing the file and waits;
    the other stays usable. */
export const ExportDownloading: Story = {
  ...desktop,
  parameters: stalled('exportEntries'),
  play: async ({ canvasElement }) => {
    const section = await exportSection(canvasElement);
    await userEvent.click(
      section.getByRole('button', { name: 'Download entries' }),
    );
    await expect(
      await section.findByRole('button', { name: 'Preparing' }),
    ).toBeDisabled();
    await expect(
      section.getByRole('button', { name: 'Download invoices' }),
    ).toBeEnabled();
  },
};

/** Failed: the section says so, and the button is ready to try again. */
export const ExportFailed: Story = {
  ...desktop,
  parameters: failing('exportInvoices'),
  play: async ({ canvasElement }) => {
    const section = await exportSection(canvasElement);
    await userEvent.click(
      section.getByRole('button', { name: 'Download invoices' }),
    );
    await expect(await section.findByRole('alert')).toHaveTextContent(
      'The download didn’t complete. Try again.',
    );
    await expect(
      section.getByRole('button', { name: 'Download invoices' }),
    ).toBeEnabled();
  },
};
