import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { desktop, light, phone, screen, tablet } from '@/mocks/screen';
import { Home } from './home';

const meta = {
  title: 'Screens/Home',
  component: Home,
  ...screen('/'),
} satisfies Meta<typeof Home>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-month: the week half done, the month on pace, two invoices out. */
export const Desktop: Story = { ...desktop };
export const Tablet: Story = { ...tablet };
/** Below `@2xl` the regions stack into one column. */
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** A timer running: its task leads Today, and the timer bar counts it. */
export const Running: Story = { ...desktop, parameters: { db: 'running' } };

/** A new account: every figure is zero and nothing is extrapolated. */
export const Empty: Story = { ...desktop, parameters: { db: 'empty' } };
