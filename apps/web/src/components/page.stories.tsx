import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Empty } from './page';

/** The shapes every list screen is assembled from. */
const meta = {
  title: 'Primitives/Page',
  component: Empty,
} satisfies Meta<typeof Empty>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An empty list says what to do next. */
export const EmptyList: Story = {
  args: {
    children: "Who's paying you? Add a client and what you charge them.",
  },
};
