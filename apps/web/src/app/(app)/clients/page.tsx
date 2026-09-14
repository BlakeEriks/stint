import { Suspense } from 'react';
import { ClientList } from '@/components/client-list';

/**
 * Suspense for the same reason `/invoices` has it: `ClientList` reads
 * `?status=` with `useSearchParams`, which forces a client-side bailout, and
 * `next build` fails outright without a boundary even though `next dev`
 * renders it happily.
 *
 * The fallback is deliberately nothing — the list renders its own "Loading…"
 * once mounted.
 */
export default function Page() {
  return (
    <Suspense>
      <ClientList />
    </Suspense>
  );
}
