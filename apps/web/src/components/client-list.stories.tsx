import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { account } from '@/mocks/db';
import { at, desktop, failing, light, phone, screen } from '@/mocks/screen';
import { ClientList } from './client-list';

const meta = {
  title: 'Screens/Clients',
  component: ClientList,
  ...screen('/clients'),
} satisfies Meta<typeof ClientList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Active clients: a swatch, or a hollow ring for none; the rate, or `—`
    for one inherited; what is unbilled, or nothing when it is zero. */
export const Desktop: Story = { ...desktop };
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

export const Archived: Story = {
  ...desktop,
  parameters: at('/clients', { status: 'archived' }),
};
/** Archived rows keep their shape and gain a badge. */
export const All: Story = {
  ...desktop,
  parameters: at('/clients', { status: 'all' }),
};
export const Empty: Story = { ...desktop, parameters: account('empty') };
export const Failed: Story = { ...desktop, parameters: failing('clients') };
