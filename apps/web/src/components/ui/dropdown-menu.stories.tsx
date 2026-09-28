import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

const meta = {
  component: DropdownMenu,
  decorators: [
    (Story) => (
      <div className="h-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ClientPicker: Story = {
  args: { open: true, modal: false },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger asChild>
        <Button className="w-56 justify-between">
          Northwind Studio <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Client</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="northwind">
          <DropdownMenuRadioItem value="acme">Acme Corp</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="northwind">
            Northwind Studio
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="globex">Globex Labs</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus />
          Add a client…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
