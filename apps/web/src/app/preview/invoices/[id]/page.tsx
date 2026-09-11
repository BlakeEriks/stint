'use client';
import { use } from 'react';
import { InvoiceDetail } from '@/components/invoice-detail';
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <InvoiceDetail id={id} />;
}
