import { Providers } from '@/components/providers';
import { AppShell } from '@/components/app-shell';

/**
 * The application shell.
 *
 * A nested layout — `src/app/layout.tsx` still owns `<html>`, the fonts and
 * the pre-paint theme script. `Providers` lives here rather than at the root
 * because the landing page is static and needs neither the Query cache nor
 * the timer.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
