import { Providers } from '@/components/providers';
import { AppHeader } from '@/components/app-header';
import { Nav } from '@/components/nav';
import { Dock } from '@/components/dock';
import { TimerDock } from '@/components/timer-dock';

/**
 * The application shell: nav rail plus a scrolling content column.
 *
 * Applies to every route in the `(app)` group — which is all of them on the
 * app subdomain. The marketing group's landing page gets none of it.
 *
 * This is a nested layout, not a root one — `src/app/layout.tsx` still owns
 * `<html>`, the fonts and the pre-paint theme script.
 *
 * `Providers` lives here rather than at the root because the landing page is
 * static and needs neither the Query cache nor the timer context.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      {/* The frame, top to bottom: header, then a row of rail + content +
          dock, then the timer.

          The header and the timer bar bound the whole thing, which is what
          makes the middle row read as columns of one frame rather than three
          independent strips. Both are flex siblings rather than `position:
          fixed` — the content column simply ends between them, so there is no
          reserved padding to keep in sync and nothing overlaps the last row
          of a list.

          At `sm` and up the PAGE does not scroll (`h-dvh` + `overflow-hidden`)
          and the content column scrolls inside itself, so the rail, header
          and bar stay put without being positioned.

          On a phone the whole page scrolls instead: the nav is a horizontal
          strip under the header, and the timer is `sticky` so it stays
          reachable without pinning a viewport that is mostly keyboard once
          the task input has focus. */}
      <div className="flex min-h-dvh flex-col sm:h-dvh sm:min-h-0 sm:overflow-hidden">
        <AppHeader />
        {/* The rail and the dock change axis at different widths, so they are
            not siblings in one row. The rail moves beside the content at
            `lg`; the dock stays a band beneath it until `xl`, where there is
            finally room for a third column.

            `lg`, not `sm`: the rail costs a fixed 208px, and between 640 and
            1024 the content is still one column, so that width buys nothing —
            measured at 900px, the rail held 183px of labels in 208px while
            the cards had 692px. `lg` is where the cards go two-column and
            start actually using it. The strip needs 596px for five sections,
            so it fits every width below that with room to spare.

            Below `xl` the scroller is therefore the wrapper around content +
            dock, so the dock scrolls with the page it summarises. At `xl` it
            becomes a column that scrolls on its own. */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <Nav />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-visible">
            {/* `bg-surface-primary`, a step above the rail and dock that
                flank it. The frame is tiered — bars darkest, rail and dock
                above them, content above that, cards above that again — so
                depth increases toward what is actually being read. */}
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
