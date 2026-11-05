import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SaveIndicator } from './save-indicator';

/** A region's autosave. Idle still holds its space, so nothing shifts when
    a save begins; an error is worded, never a color alone. */
const meta = {
  title: 'Primitives/SaveIndicator',
  component: SaveIndicator,
  args: { state: 'idle' },
} satisfies Meta<typeof SaveIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Pending: Story = { args: { state: 'pending' } };
export const Saved: Story = { args: { state: 'saved' } };
export const Failed: Story = { args: { state: 'error' } };
