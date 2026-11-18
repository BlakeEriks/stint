import { Suspense } from 'react';
import { InvoiceFromQuery } from '@/components/invoice-detail';

/** `InvoiceFromQuery` reads `?id=` with `useSearchParams`, which `next build`
 *  refuses without a Suspense boundary. */
export default function Page() {
  return (
    <Suspense>
      <InvoiceFromQuery />
    </Suspense>
  );
}
