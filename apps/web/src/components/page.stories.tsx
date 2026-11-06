import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Empty, FilterTabs, Panel } from './page';

/** The shapes every list screen is assembled from. */
const meta = {
  title: 'Primitives/Page',
  component: FilterTabs,
  parameters: { nextjs: { navigation: { pathname: '/clients' } } },
  args: {
    base: '/clients',
    active: null,
    tabs: [
      { key: null, label: 'Active' },
      { key: 'archived', label: 'Archived' },
      { key: 'all', label: 'All' },
    ],
  },
} satisfies Meta<typeof FilterTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A filter lives in the URL, so it survives a reload and a Back. */
export const Tabs: Story = {};
export const TabsArchived: Story = { args: { active: 'archived' } };

/** An empty list names the job its button does. */
export const EmptyList: Story = {
  render: () => (
    <Panel>
      <Empty>Who's paying you? Add a client and what you charge them.</Empty>
    </Panel>
  ),
};
