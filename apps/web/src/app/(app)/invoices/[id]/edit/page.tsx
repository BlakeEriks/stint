import { EditInvoice } from '@/components/invoice-new';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditInvoice id={id} />;
}
