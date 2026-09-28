import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';
import { Label } from './label';

const meta = {
  component: Input,
  args: { 'aria-label': 'Client name', placeholder: 'Northwind Studio' },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = { args: { defaultValue: 'Acme Corp' } };

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: '-40', 'aria-label': 'Rate' },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: '$150.00 / hr', 'aria-label': 'Rate' },
};

export const DateField: Story = {
  args: { type: 'date', defaultValue: '2026-09-26', 'aria-label': 'Date paid' },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="client-name">Client name</Label>
      <Input id="client-name" {...args} aria-label={undefined} />
    </div>
  ),
};
