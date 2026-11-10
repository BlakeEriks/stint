import { Suspense } from 'react';
import { SettingsPage } from '@/components/settings-page';

/**
 * The Plan section reads `?checkout=` with `useSearchParams`, which `next
 * build` refuses without a Suspense boundary. No fallback: the page renders
 * its own loading state once mounted.
 */
export default function Page() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
