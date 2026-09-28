import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { ColorPicker } from './color-picker';

/** Only clients have a color, from a closed set of eight or none.
    Selection is a ring, never a check. */
const meta = {
  title: 'Primitives/ColorPicker',
  component: ColorPicker,
  args: { value: null, onChange: () => {} },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <ColorPicker {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof ColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const None: Story = {};
export const Chosen: Story = { args: { value: '#6EA1E2' } };
