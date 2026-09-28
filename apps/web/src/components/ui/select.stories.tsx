import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Label } from './label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

const meta = {
  component: Select,
  args: { defaultValue: 'net30' },
  render: (args) => (
    <div className="flex h-48 w-56 flex-col gap-2">
      <Label htmlFor="terms">Payment terms</Label>
      <Select {...args}>
        <SelectTrigger id="terms" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="net15">Net 15</SelectItem>
          <SelectItem value="net30">Net 30</SelectItem>
          <SelectItem value="receipt">Due on receipt</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
  args: { defaultOpen: true },
  parameters: {
    a11y: {
      /* Open, Radix sets `aria-hidden` on everything outside the list, the
         trigger included, and traps focus inside the list, so the trigger
         cannot be reached. axe sees a focusable element under `aria-hidden`
         and cannot see the trap. */
      config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] },
    },
  },
};
