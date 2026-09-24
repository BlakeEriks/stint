import { Providers } from '@/components/providers';
import { AppHeader } from '@/components/app-header';
import { Nav, Version } from '@/components/nav';
import { Dock } from '@/components/dock';
import { TimerDock } from '@/components/timer-dock';

/**
 * The application shell: a flat ground with one panel floating on it.
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
          mostly keyboard once the task input has focus.

          `bg-surface-base` is the GROUND and runs unbroken behind everything:
          the header, the rail and the dock are painted straight onto it, so
          the only edge in the frame belongs to the panel. */}
      {/* At `2xl` the app becomes a bounded card on `bg-surface-recessed` —
          the plane the frame otherwise leaves unused, since the ground inside
          the card is `bg-surface-base`. Below it the app fills the window. */}
      <div className="flex min-h-dvh flex-col bg-surface-base sm:h-dvh sm:min-h-0 sm:overflow-hidden 2xl:items-center 2xl:bg-surface-recessed 2xl:p-6">
        <div className="flex min-h-dvh w-full flex-col bg-surface-base sm:h-full sm:min-h-0 sm:overflow-hidden 2xl:mx-auto 2xl:max-h-[900px] 2xl:max-w-[1440px] 2xl:rounded-2xl 2xl:border 2xl:border-edge-subtle 2xl:shadow-float">
          <AppHeader />
          {/* The rail and the dock change axis at different widths, so they are
            not siblings in one row: the rail moves beside the content at
            `lg`, the dock becomes a third column at `xl`. Below `xl` the
            scroller is the wrapper around content + dock, so the dock scrolls
            with the page it summarises. `frame.html` has the breakpoints.

            The gutters are what let the ground show around the panel. They
            live here rather than on the panel so the rail, the panel and the
            dock are all inset by the same amount.

            At `xl` this row is a GRID and the bar is one of its items, PLACED
            in the content column's second track. Grid placement moves the bar
            visually without moving the node, which is what lets one mount
            serve both arrangements — two mounts would put two Start buttons
            in the accessibility tree.

            Below `lg` this is a plain flex column and the bar is last in it,
            which is where it has always rendered: after the scroller, never
            inside it, so `sticky` still pins it to a phone viewport. */}
          <div
            className="flex min-h-0 flex-1 flex-col gap-4 px-3 pb-3 sm:px-4 sm:pb-4
                     lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto]
                     xl:grid-cols-[12rem_minmax(0,1fr)_286px]"
          >
            <Nav />
            <Version />
            <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto lg:col-start-2 lg:row-start-1 xl:contents">
              {/* THE PANEL. One surface with a subtle edge and the card's
                shadow — a step above the rail and dock that flank it, because
                depth increases toward what is being read. Nothing inside it
                is a card. */}
              <div className="min-w-0 flex-1 rounded-xl border border-edge-subtle bg-surface-primary shadow-card xl:col-start-2 xl:row-start-1 xl:overflow-y-auto">
                {children}
              </div>
              <Dock />
            </div>
            {/* Full width only while the nav is a strip along the top. From
              `lg` the rail is a left column, and the bar starts beside it
              rather than running underneath — the rail's footprint is the
              rail's, and a bar crossing it reads as one band spanning two
              things that are not related.

              `sticky` to a phone viewport: it sits after the scroller rather
              than inside it, which is what makes `sticky` pin rather than
              scroll away, and the negative margin lets the fill reach the
              window's edges there. */}
            <div className="sticky bottom-0 z-20 -mx-3 px-3 sm:static sm:-mx-4 sm:px-4 lg:col-start-2 lg:row-start-2 lg:mx-0 lg:px-0 xl:col-start-2">
              <TimerDock />
            </div>
          </div>
        </div>
      </div>
    </Providers>
  );
}
