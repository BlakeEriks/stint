import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { InvoiceTemplate } from '@stint/schema';
import { TemplatePicker } from './template-picker';

const meta = {
  title: 'Invoice/TemplatePicker',
  component: TemplatePicker,
  args: { value: 'standard', onChange: () => {} },
} satisfies Meta<typeof TemplatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live() {
  const [value, setValue] = useState<InvoiceTemplate>('standard');
  return (
    <div className="max-w-3xl">
      <TemplatePicker value={value} onChange={setValue} />
    </div>
  );
}

/** A press selects the card at once. */
export const Cards: Story = {
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: /Classic/ }));
    await expect(canvas.getByRole('radio', { name: /Classic/ })).toBeChecked();
  },
};

/** Preview shows the template's sample page without choosing it; Use chooses. */
export const Preview: Story = {
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Preview Creative' }),
    );
    const dialog = within(document.body).getByRole('dialog');
    await expect(
      within(dialog).getByRole('img', { name: /Creative/ }),
    ).toBeVisible();
    await expect(
      within(dialog).getByRole('button', { name: 'Use Creative' }),
    ).toBeVisible();
  },
};
