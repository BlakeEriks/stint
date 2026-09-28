import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { id } from '@/mocks/fixtures';
import { desktop, phone, screen } from '@/mocks/screen';
import { InvoiceDetail } from './invoice-detail';

/* Each status offers its own actions: a draft is deleted or sent, an issued
   invoice voided, and Download is there in every status. */
const invoice = (seq: number) => id(300 + seq);

const meta = {
  title: 'Screens/Invoices/Detail',
  component: InvoiceDetail,
  ...screen(`/invoices/${invoice(15)}`),
  args: { id: invoice(15) },
} satisfies Meta<typeof InvoiceDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = { ...desktop };
export const DraftPhone: Story = { ...phone };
export const Sent: Story = { ...desktop, args: { id: invoice(14) } };
export const Overdue: Story = { ...desktop, args: { id: invoice(13) } };
export const Paid: Story = { ...desktop, args: { id: invoice(12) } };
export const Void: Story = { ...desktop, args: { id: invoice(9) } };
export const Missing: Story = { ...desktop, args: { id: invoice(99) } };
