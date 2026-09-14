import { Suspense } from 'react';
import { ClientList } from '@/components/client-list';

/** Suspense for the reason `(app)/invoices/page.tsx` gives. */
export default function Page() {
  return (
    <Suspense>
      <ClientList />
    </Suspense>
  );
}
