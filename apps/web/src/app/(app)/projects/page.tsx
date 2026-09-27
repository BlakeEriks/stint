import { Suspense } from 'react';
import { ProjectList } from '@/components/project-list';

/** Suspense for the reason `(app)/invoices/page.tsx` gives. */
export default function Page() {
  return (
    <Suspense>
      <ProjectList />
    </Suspense>
  );
}
