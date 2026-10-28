import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { InvoiceTemplate } from '@stint/schema';
import { DetailPaper, InvoicePaper } from './invoice-paper';
import { SAMPLE } from './template-picker';

/** Each template as the PDF prints it (specs/011-invoice-templates/design/
    invoice.html): page 1, then the supporting detail. */
const meta = {
  title: 'Invoice/Templates',
  component: InvoicePaper,
  args: { template: 'standard', invoice: SAMPLE },
} satisfies Meta<typeof InvoicePaper>;

export default meta;
type Story = StoryObj<typeof meta>;

const DETAIL = {
  project: [
    { project: 'Warehouse dashboard', hours: 32.5 },
    { project: 'Rush: peak season fixes', hours: 12 },
  ],
  week: [
    { start: '2026-09-01', end: '2026-09-06', hours: 9 },
    { start: '2026-09-07', end: '2026-09-13', hours: 11.5 },
    { start: '2026-09-14', end: '2026-09-20', hours: 10.25 },
    { start: '2026-09-21', end: '2026-09-27', hours: 9.25 },
    { start: '2026-09-28', end: '2026-09-30', hours: 4.5 },
  ],
  date: [
    { date: '2026-09-01', project: 'Warehouse dashboard', hours: 3 },
    { date: '2026-09-03', project: 'Rush: peak season fixes', hours: 2.5 },
    { date: '2026-09-08', project: 'Warehouse dashboard', hours: 4 },
  ],
  totalHours: 44.5,
};

const pages = (template: InvoiceTemplate): Story => ({
  args: { template },
  render: (args) => (
    <div className="flex max-w-[612px] flex-col gap-4">
      <InvoicePaper {...args} />
      <DetailPaper
        template={template}
        detail={DETAIL}
        chosen={['project', 'week', 'date']}
        heading="INV-0015 · Northwind Trading · Sep 1, 2026 – Sep 30, 2026"
      />
    </div>
  ),
});

export const Standard = pages('standard');
export const Modern = pages('modern');
export const Classic = pages('classic');
export const Creative = pages('creative');

/** No logo, reference, payment details, fixed fees or expenses: what is
    absent leaves no label and no gap. */
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
            lines: SAMPLE.lines?.filter((l) => l.unit === 'hour'),
            subtotal: 7215,
            expensesSubtotal: 0,
            total: 7215,
          }}
        />
      ))}
    </div>
  ),
};
