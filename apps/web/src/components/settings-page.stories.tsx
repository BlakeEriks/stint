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
/** Each billing default carries its unit inside the field, the way the rate
    does, and numbering explains itself under its heading. */
export const BillingUnits: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    for (const [label, unit] of [
      ['Default hourly rate', '/ hr'],
      ['Flag entries over', 'hours'],
      ['Payment terms', 'days'],
    ] as const) {
      const field = (await page.findByLabelText(label)).parentElement;
      await expect(within(field as HTMLElement).getByText(unit)).toBeVisible();
    }
    await expect(page.queryByText(/Blank turns it off/)).toBeNull();
    await expect(page.queryByText(/0 is due on receipt/)).toBeNull();
    const numbering = page
      .getByRole('heading', { name: 'Invoice numbering' })
      .closest('section') as HTMLElement;
    await expect(
      within(numbering).getByText(/invoices you sent before Stint/),
    ).toBeVisible();
  },
};
/** On a phone the theme toggle drops under the Appearance heading, every
    word still showing, and the page never scrolls sideways. */
export const Phone: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const group = await page.findByRole('radiogroup', { name: 'Theme' });
    for (const word of ['System', 'Light', 'Dark']) {
      await expect(within(group).getByText(word)).toBeVisible();
    }
    const heading = page.getByText('This device only.').getBoundingClientRect();
    const toggle = group.getBoundingClientRect();
    await expect(toggle.top).toBeGreaterThanOrEqual(heading.bottom);
    const section = group.closest('section') as HTMLElement;
    await expect(toggle.right).toBeLessThanOrEqual(
      section.getBoundingClientRect().right,
    );
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
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

/** Next number moves forward to start past invoices sent before Stint. A
    step back is refused, and the field says why. */
export const NextNumberForwardOnly: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const field = await page.findByLabelText('Next number');
    await userEvent.clear(field);
    await userEvent.type(field, '20');
    await expect(
      await page.findByLabelText('Saved', {}, { timeout: 3000 }),
    ).toBeVisible();
    await userEvent.clear(field);
    await userEvent.type(field, '18');
    await expect(
      await page.findByText(/can't go below 20/, {}, { timeout: 3000 }),
    ).toBeVisible();
    await expect(page.getByText('Not saved')).toBeVisible();
    await expect(field).toHaveValue(20);
  },
};

/** Payment terms are whole days: 45 saves, and 400 is refused at the field
    without a request. */
export const PaymentTermsDays: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const field = await page.findByLabelText('Payment terms');
    await expect(field).toHaveValue('30');
    await userEvent.clear(field);
    await userEvent.type(field, '45');
    await expect(
      await page.findByLabelText('Saved', {}, { timeout: 3000 }),
    ).toBeVisible();
    await userEvent.clear(field);
    await userEvent.type(field, '400');
    await expect(page.getByText('Whole days, 0 to 365.')).toBeVisible();
  },
};

/** Past the ceiling is refused the same way: the field says why and shows
    the number the next invoice takes. */
export const NextNumberCeiling: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const field = await page.findByLabelText('Next number');
    await userEvent.clear(field);
    await userEvent.type(field, '1000000');
    await expect(
      await page.findByText(/can't go above 999999/, {}, { timeout: 3000 }),
    ).toBeVisible();
    await expect(field).toHaveValue(16);
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
    await expect(options.map((o) => o.textContent)).toEqual([
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

/** All or nothing: a failed delete says to try again. */
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
    await expect(
      await page.findByText(/Couldn't delete your account/),
    ).toBeVisible();
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

/** On its way: one quiet word where it will be, and none of it until all of
 *  it has arrived. */
export const Loading: Story = {
  ...desktop,
  parameters: stalled('paymentProfiles'),
  play: async ({ canvasElement }) => {
    const main = canvasElement.querySelector('main') as HTMLElement;
    const region = within(main);
    await expect(await region.findByRole('status')).toHaveTextContent(
      'Loading',
    );
    // The whole page waits: no section paints ahead of the rest.
    await expect(region.queryByText('Import')).toBeNull();
    await expect(region.queryByRole('button', { name: /export/i })).toBeNull();
    // Centered on the card, not tucked under the title.
    const panel = main.parentElement as HTMLElement;
    const word = (await region.findByRole('status')).getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    await expect(
      Math.abs(word.top + word.height / 2 - (box.top + box.height / 2)),
    ).toBeLessThan(4);
  },
};
