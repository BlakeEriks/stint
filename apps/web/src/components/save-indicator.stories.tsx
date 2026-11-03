import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SaveIndicator } from './save-indicator';

/** An autosave's answer, in words: nothing at rest, then Saving…, Saved or
    Not saved. */
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
