import { Providers } from '@/components/providers';
import { AppHeader } from '@/components/app-header';
import { Nav } from '@/components/nav';
import { Dock } from '@/components/dock';
import { TimerDock } from '@/components/timer-dock';

/**
 * The application shell: nav rail plus a scrolling content column.
 *
 * A nested layout — `src/app/layout.tsx` still owns `<html>`, the fonts and
 * the pre-paint theme script. `Providers` lives here rather than at the root
 * because the landing page is static and needs neither the Query cache nor
 * the timer context.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      {/* The header and the timer bar are flex siblings rather than
          `position: fixed` — the content column ends between them, so there
          is no reserved padding to keep in sync and nothing overlaps the last
          row of a list.

          At `sm` and up the PAGE does not scroll and the content column
          scrolls inside itself. On a phone the whole page scrolls and the
          timer is `sticky`, so it stays reachable on a viewport that is
          mostly keyboard once the task input has focus. */}
      <div className="flex min-h-dvh flex-col sm:h-dvh sm:min-h-0 sm:overflow-hidden">
        <AppHeader />
        {/* The rail and the dock change axis at different widths, so they are
            not siblings in one row: the rail moves beside the content at
            `lg`, the dock becomes a third column at `xl`. Below `xl` the
            scroller is the wrapper around content + dock, so the dock scrolls
            with the page it summarises. `frame.html` has the breakpoints. */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <Nav />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-visible">
            {/* A step above the rail and dock that flank it: depth increases
                toward what is being read. */}
            <div className="min-w-0 flex-1 bg-surface-primary xl:overflow-y-auto">
              {children}
            </div>
            <Dock />
          </div>
        </div>
        <div className="sticky bottom-0 z-20 sm:static">
          <TimerDock />
        </div>
      </div>
    </Providers>
  );
}
