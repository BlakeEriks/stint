import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { seed } from '@/mocks/fixtures';
import { expectOpen, menuOpen } from '@/mocks/screen';
import { NOW } from '@/mocks/time.mts';
import { ClientPicker } from './client-picker';

const clients = seed(new Date(NOW)).clients.filter((c) => !c.archivedAt);

/** A `DropdownMenu`, not a `Select`: its rows carry a swatch, and it can
    grow an "Add a client…" item. Unset means internal work. */
const meta = {
  title: 'Primitives/ClientPicker',
  component: ClientPicker,
  args: { clients, value: null, onChange: () => {} },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ClientPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unset: Story = {};

export const Open: Story = {
  args: { onAdd: () => {} },
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    await expectOpen(canvasElement, 'menu');
  },
};
