import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ids } from '@/mocks/fixtures';
import { desktop, phone, screen } from '@/mocks/screen';
import { ClientForm } from './client-form';
import { EditClient } from './edit-client';
import { DetailPage } from './page';

/** One form for create and edit; only the name is required. */
const meta = {
  title: 'Screens/Clients/Form',
  component: ClientForm,
  ...screen('/clients/new'),
} satisfies Meta<typeof ClientForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `/clients/new`, as its page composes it. */
const New = () => (
  <DetailPage back="/clients" label="Clients">
    <h1 className="mb-6 type-title text-strong">Add client</h1>
    <ClientForm />
  </DetailPage>
);

export const Add: Story = { ...desktop, render: () => <New /> };
export const AddPhone: Story = { ...phone, render: () => <New /> };

/** `/clients/:id/edit`: the same form, filled, saving in place. */
export const Edit: Story = {
  ...desktop,
  render: () => <EditClient id={ids.northwind} />,
};
