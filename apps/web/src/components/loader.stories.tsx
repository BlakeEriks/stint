import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { Loader } from './loader';

const meta = {
  title: 'Parts/Loader',
  component: Loader,
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One quiet word. It waits 600ms before it shows, so a load that finishes
 *  sooner never shows it at all. */
export const Loading: Story = {
  play: async ({ canvasElement }) => {
    // By its word: the frame around a story has a status region of its own.
    const status = await within(canvasElement).findByText('Loading');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(getComputedStyle(status).animationDelay).toMatch(/^0\.6s/);
  },
};

/** Under a heading that already has space above it. */
export const Tight: Story = { args: { tight: true } };
