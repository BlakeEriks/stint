import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/app-shell';
import { TimerChanges } from '@/components/timer-changes';

/**
 * The application shell.
 *
 * A nested layout — `src/app/layout.tsx` still owns `<html>`, the fonts and
 * the pre-paint theme script. `Providers` lives here rather than at the root
 * because the landing page is static and needs neither the Query cache nor
 * the timer.
 */
/* The title lives in this layout, which stays mounted between sections, not
   in each page's metadata, which a section switch takes out until the next
   page's arrives. With no title, Next's route announcer reads the first h1,
   and the router keeps the section left behind mounted but hidden: a screen
   reader would hear that section's name. */
export const metadata: Metadata = { title: null };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <title>Stint</title>
      <TimerChanges />
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
