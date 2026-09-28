import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Money } from './money';

/** A figure: mono, tabular, rolling only when its value changes. */
const meta = {
  title: 'Primitives/Money',
  component: Money,
  args: {
    figure: 'story',
    amount: 12495.32,
    currency: 'USD',
    className: 'type-amount-hero text-strong',
  },
} satisfies Meta<typeof Money>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hero: Story = {};
export const Row: Story = {
  args: { amount: 761, className: 'type-amount text-primary' },
};
