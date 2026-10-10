import { InvoiceDetailRoute } from '@/components/invoice-detail';

/* No paths at build time and none read here, so every invoice is one static
   page: opening one never waits on the server (Constitution VI). */
export function generateStaticParams() {
  return [];
}

export default function Page() {
  return <InvoiceDetailRoute />;
}
