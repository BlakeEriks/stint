import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

const meta = {
  component: Dialog,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ghost Cancel, then the one confirm the dialog exists to complete. */
export const MarkPaid: Story = {
  args: { open: true },
  render: (args) => (
    <Dialog {...args}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark paid</DialogTitle>
          <DialogDescription>
            When did the payment actually arrive?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="paid-at">Date paid</Label>
          <Input id="paid-at" type="date" defaultValue="2026-09-26" />
        </div>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button variant="accent">Mark paid</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
