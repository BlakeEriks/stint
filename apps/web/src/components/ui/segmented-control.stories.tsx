import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { phone } from '@/mocks/screen';
import { SegmentedControl } from './segmented-control';

type Mode = 'system' | 'light' | 'dark';

function Example() {
  const [value, setValue] = useState<Mode>('system');
  return (
    <SegmentedControl
      label="Theme"
      value={value}
      onValueChange={setValue}
      segments={[
        { value: 'system', label: 'System', icon: Monitor },
        { value: 'light', label: 'Light', icon: Sun },
        { value: 'dark', label: 'Dark', icon: Moon },
      ]}
    />
  );
}

const meta = {
  title: 'Primitives/SegmentedControl',
  component: Example,
} satisfies Meta<typeof Example>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A press chooses; an arrow key moves to the next segment and chooses it. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const group = within(canvasElement);
    await userEvent.click(group.getByRole('radio', { name: 'Light' }));
    await expect(group.getByRole('radio', { name: 'Light' })).toBeChecked();
    /* Held, as a finger does: Radix moves focus on a timeout and chooses on
       focus only while the arrow is still down. */
    await userEvent.keyboard('{ArrowRight>}');
    await waitFor(() =>
      expect(group.getByRole('radio', { name: 'Dark' })).toBeChecked(),
    );
    await userEvent.keyboard('{/ArrowRight}');
    await expect(group.getByRole('radio', { name: 'Dark' })).toHaveFocus();
  },
};

/** On a phone the words drop; each icon keeps its word as its name. */
export const Phone: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    const dark = within(canvasElement).getByRole('radio', { name: 'Dark' });
    await expect(dark).toHaveAttribute('title', 'Dark');
    await expect(within(dark).getByText('Dark')).not.toBeVisible();
  },
};
