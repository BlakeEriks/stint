import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InvoicePaper } from './invoice-paper';
import { SAMPLE } from './template-picker';

/** Each template's look as the thumbnails draw it, from the sample invoice
    (specs/011-invoice-templates/design/invoice.html). */
const meta = {
  title: 'Invoice/Templates',
  component: InvoicePaper,
  args: { template: 'standard', invoice: SAMPLE },
  render: (args) => (
    <div className="max-w-[612px]">
      <InvoicePaper {...args} />
    </div>
  ),
} satisfies Meta<typeof InvoicePaper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Modern: Story = { args: { template: 'modern' } };
export const Classic: Story = { args: { template: 'classic' } };
export const Creative: Story = { args: { template: 'creative' } };

/** No reference, payment details, fixed fees or expenses: what is absent
    leaves no label and no gap. */
export const Bare: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      {(['standard', 'modern', 'classic', 'creative'] as const).map((t) => (
        <InvoicePaper
          key={t}
          template={t}
          invoice={{
            ...SAMPLE,
            reference: null,
            payment: null,
            notes: null,
            lines: SAMPLE.lines.filter((l) => l.unit === 'hour'),
            subtotal: 7215,
            expensesSubtotal: 0,
            total: 7215,
          }}
        />
      ))}
    </div>
  ),
};
