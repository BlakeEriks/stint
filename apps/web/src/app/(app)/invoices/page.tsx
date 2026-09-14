import { Suspense } from 'react';
import { InvoiceList } from '@/components/invoice-list';

/**
 * `InvoiceList` reads `?status=` with `useSearchParams`, which forces a
 * client-side bailout: `next build` fails outright without a Suspense
 * boundary, while `next dev` and the test suites render it happily.
 *
 * No fallback — the list renders its own "Loading…" once mounted.
 */
export default function Page() {
  return (
    <Suspense>
      <InvoiceList />
    </Suspense>
  );
}
