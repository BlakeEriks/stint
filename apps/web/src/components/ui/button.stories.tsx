import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from './button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Add client' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The one confirm a screen exists to complete. */
export const Accent: Story = {
  args: { variant: 'accent', children: 'Create invoice' },
};

export const Ghost: Story = { args: { variant: 'ghost', children: 'Cancel' } };

/** The second step of a destructive pair. */
export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete entry' },
};

export const Disabled: Story = {
  args: { disabled: true, children: 'Send invoice' },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="xs">Edit</Button>
      <Button size="sm">Edit rate</Button>
      <Button>Edit rate</Button>
      <Button size="icon-sm" variant="ghost" aria-label="Delete">
        <Trash2 />
      </Button>
      <Button size="icon" aria-label="Add">
        <Plus />
      </Button>
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Plus />
        New project
      </>
    ),
  },
};
