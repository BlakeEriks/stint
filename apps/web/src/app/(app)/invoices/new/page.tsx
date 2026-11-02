import { Suspense } from 'react';
import { NewInvoice } from '@/components/invoice-new';

/** `NewInvoice` reads `?client=&from=&to=` with `useSearchParams`, which
 *  `next build` refuses without a Suspense boundary. */
export default function Page() {
  return (
    <Suspense>
      <NewInvoice />
    </Suspense>
  );
}
