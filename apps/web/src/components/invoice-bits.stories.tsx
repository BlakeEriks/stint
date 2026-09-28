import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBadge } from './invoice-bits';

/** Paid is the success green; void is struck through; neither shouts. */
const meta = {
  title: 'Primitives/StatusBadge',
  component: StatusBadge,
  args: { status: 'draft' },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {
  render: () => (
    <div className="flex gap-3">
      <StatusBadge status="draft" />
      <StatusBadge status="sent" />
      <StatusBadge status="paid" />
      <StatusBadge status="void" />
    </div>
  ),
};
