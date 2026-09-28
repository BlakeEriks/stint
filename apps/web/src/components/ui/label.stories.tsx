import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Primitives/Label',
  component: Label,
  args: { htmlFor: 'rate', children: 'Hourly rate' },
  render: (args) => (
    <div className="flex w-72 flex-col gap-2">
      <Label {...args} />
      <Input id="rate" defaultValue="$150.00" />
    </div>
  ),
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A label dims with its field: the field is a `peer` placed after it. */
export const Disabled: Story = {
  args: { htmlFor: 'invoice-number', children: 'Invoice number' },
  render: (args) => (
    <div className="flex w-72 flex-col gap-2">
      <Input
        id="invoice-number"
        className="peer order-2"
        disabled
        defaultValue="INV-0042"
      />
      <Label {...args} className="order-1" />
    </div>
  ),
};
