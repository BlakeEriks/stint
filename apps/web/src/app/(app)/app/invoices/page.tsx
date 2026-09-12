import { Suspense } from 'react';
import { InvoiceList } from '@/components/invoice-list';

/**
 * `InvoiceList` reads `?status=` with `useSearchParams`, which forces a
 * client-side bailout — and Next fails the production build outright if that
 * is not inside a Suspense boundary, even though `next dev` renders it
 * happily. The build was broken for several commits because of exactly that
 * gap: nothing in the dev loop or the test suites compiles the page the way
 * `next build` does.
 *
 * The fallback is deliberately nothing. The list renders its own "Loading…"
 * once mounted, and a second spinner above it would flash a different shape
 * for a frame.
 */
export default function Page() {
  return (
    <Suspense>
      <InvoiceList />
    </Suspense>
  );
}
