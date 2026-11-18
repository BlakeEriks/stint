import { Suspense } from 'react';
import { InvoiceFromQuery } from '@/components/invoice-detail';

/** Suspense for the reason `(app)/invoices/page.tsx` gives. */
export default function Page() {
  return (
    <Suspense>
      <InvoiceFromQuery />
    </Suspense>
  );
}
