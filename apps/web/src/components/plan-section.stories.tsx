import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getRouter } from '@storybook/nextjs-vite/navigation.mock';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account } from '@/mocks/db';
import type { Db } from '@/mocks/fixtures';
import { at, desktop, failing, phone, screen, stalled } from '@/mocks/screen';
import { SettingsPage } from './settings-page';

/** Settings' Plan section, one story per state a user can see. */
const meta = {
  title: 'Screens/Settings/Plan',
  component: SettingsPage,
  ...screen('/settings'),
} satisfies Meta<typeof SettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const RENEWS = '2027-10-12T18:00:00.000Z';

/** Where Stripe's Checkout sends a user back to. */
const RETURNED = at('/settings', { checkout: 'cs_story' });

const subscribed = (over: Partial<Db['billing']> = {}) =>
  account((db) => {
    db.billing = {
      available: true,
      plan: 'paid',
      status: 'active',
      periodEnd: RENEWS,
      cancelAtPeriodEnd: false,
      paymentFailed: false,
      ...over,
    };
  });

/** The section, found by its heading. */
const plan = async (canvasElement: HTMLElement) => {
  const heading = await within(canvasElement).findByRole('heading', {
    name: 'Plan',
  });
  return within(heading.closest('section') as HTMLElement);
};

/** Free: the price, what paid adds, that the records and their export stay
    free, and Subscribe. */
export const Free: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await expect(section.getByText(/\$40 a year/)).toBeVisible();
    await expect(section.getByText(/exporting them included/)).toBeVisible();
    await expect(
      section.getByRole('button', { name: 'Subscribe' }),
    ).toBeEnabled();
  },
};

export const FreePhone: Story = { ...phone };

/** Subscribe is pending until Stripe's page opens. */
export const Subscribing: Story = {
  ...desktop,
  parameters: stalled('checkout'),
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await userEvent.click(section.getByRole('button', { name: 'Subscribe' }));
    await expect(
      await section.findByRole('button', { name: /Opening checkout/ }),
    ).toBeDisabled();
  },
};

/** Checkout could not be opened: the pending ends and the notice says why. */
export const CheckoutFailed: Story = {
  ...desktop,
  parameters: failing('checkout'),
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await userEvent.click(section.getByRole('button', { name: 'Subscribe' }));
    await expect(
      await within(canvasElement.ownerDocument.body).findByText(
        /Couldn’t open checkout/,
      ),
    ).toBeVisible();
    await expect(
      section.getByRole('button', { name: 'Subscribe' }),
    ).toBeEnabled();
  },
};

/** Back from Checkout, waiting on Stripe's answer. */
export const Confirming: Story = {
  ...desktop,
  parameters: { ...RETURNED, ...stalled('syncCheckout') },
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await expect(await section.findByRole('status')).toHaveTextContent(
      'Confirming your payment…',
    );
  },
};

/** Confirmed: paid, and `?checkout=` is dropped so a reload asks nothing. */
export const Confirmed: Story = {
  ...desktop,
  parameters: RETURNED,
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await expect(await section.findByText(/Renews on/)).toBeVisible();
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith('/settings'),
    );
  },
};

/** Paid: when it renews, and Manage billing. */
export const Paid: Story = {
  ...desktop,
  parameters: subscribed(),
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await expect(
      section.getByText('Paid. Renews on October 12, 2027 at $40 a year.'),
    ).toBeVisible();
    await expect(
      section.getByRole('button', { name: 'Manage billing' }),
    ).toBeEnabled();
  },
};

/** Canceled in the Portal: paid until the year ends, and resumable there. */
export const Canceling: Story = {
  ...desktop,
  parameters: subscribed({ cancelAtPeriodEnd: true }),
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await expect(
      section.getByText('Paid until October 12, 2027. It won’t renew.'),
    ).toBeVisible();
  },
};

/** A renewal failed: still paid while Stripe retries, and Update card. */
export const PaymentFailed: Story = {
  ...desktop,
  parameters: subscribed({ status: 'past_due', paymentFailed: true }),
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await expect(section.getByText(/Your last payment failed/)).toBeVisible();
    await expect(
      section.getByRole('button', { name: 'Update card' }),
    ).toBeEnabled();
  },
};

/** Manage billing is pending until the Portal opens. */
export const OpeningPortal: Story = {
  ...desktop,
  parameters: { ...subscribed(), ...stalled('billingPortal') },
  play: async ({ canvasElement }) => {
    const section = await plan(canvasElement);
    await userEvent.click(
      section.getByRole('button', { name: 'Manage billing' }),
    );
    await expect(
      await section.findByRole('button', { name: /Opening billing/ }),
    ).toBeDisabled();
  },
};

/** Billing not set up, as on every deploy until Stripe is: no section. */
export const Unavailable: Story = {
  ...desktop,
  parameters: account((db) => {
    db.billing.available = false;
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByRole('heading', { name: 'Account' });
    await expect(
      page.queryByRole('heading', { name: 'Plan' }),
    ).not.toBeInTheDocument();
  },
};
