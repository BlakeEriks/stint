import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Kbd } from './kbd';

const meta = {
  title: 'Primitives/Kbd',
  component: Kbd,
  args: { children: '↵' },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Glyph: Story = {};

export const Word: Story = { args: { children: 'Esc' } };

/** How the app uses it: a key named inside a hint, never a control. */
export const InHint: Story = {
  render: () => (
    <p className="flex items-center gap-1.5 text-sm text-muted">
      Press <Kbd>↵</Kbd> to start the timer, <Kbd>Esc</Kbd> to dismiss
    </p>
  ),
};
