import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { seed } from '@/mocks/fixtures';
import { desktop } from '@/mocks/screen';
import { NOW } from '@/mocks/time.mts';
import { PaymentProfileDialog } from './payment-profile-dialog';

const [ach] = seed(new Date(NOW)).paymentProfiles;

/** Bank details, printed on every invoice. */
const meta = {
  title: 'Parts/PaymentProfileDialog',
  component: PaymentProfileDialog,
  args: { open: true, onOpenChange: () => {}, existing: ach },
} satisfies Meta<typeof PaymentProfileDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Edit: Story = { ...desktop };

/** A routing number that fails the ABA check is refused at its field. */
export const BadRoutingNumber: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const routing = await page.findByLabelText('Routing number');
    await userEvent.clear(routing);
    await userEvent.type(routing, '021000022');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(
      await page.findByText(/Not a valid routing number/),
    ).toBeVisible();
    await expect(routing).toHaveAttribute('aria-invalid', 'true');
    await expect(routing).toHaveAccessibleDescription(
      /^Not a valid routing number/,
    );
  },
};
