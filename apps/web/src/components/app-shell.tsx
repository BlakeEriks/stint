import { Suspense } from 'react';
import { BackTrail } from './back-link';
import { AppHeader } from './app-header';
import { Nav, Version } from './nav';
import { ContentPanel } from './content-panel';
import { Dock } from './dock';
import { TimerDock } from './timer-dock';

/**
 * The application frame: a flat ground with one panel floating on it.
 *
 * Its own component so the app's layout and every screen story render the
 * same frame — a story that drew its own would be a second copy to drift.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Reads the query string, which a statically rendered route may only
          do under a Suspense boundary. */}
      <Suspense fallback={null}>
        <BackTrail />
      </Suspense>
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
          the card is `bg-surface-base`. Below it the app fills the window.
          Past `2xl` the content's measure is capped anyway, so the surplus
          is better spent as ground than as a stretched frame; it is
          top-aligned because the header and rail are reached by muscle
          memory.

          A workspace screen (`Page`'s `data-workspace`) drops the dock's
          column and keeps the card as it is: the dock is the room it needs,
          and a card that resized between screens would jolt the frame. */}
      <div className="flex min-h-dvh flex-col bg-surface-base sm:h-dvh sm:min-h-0 sm:overflow-hidden 2xl:items-center 2xl:bg-surface-recessed 2xl:p-6">
        <div className="group/app flex min-h-dvh w-full flex-col bg-surface-base sm:h-full sm:min-h-0 sm:overflow-hidden 2xl:mx-auto 2xl:max-h-[900px] 2xl:max-w-[1440px] 2xl:rounded-2xl 2xl:border 2xl:border-edge-subtle 2xl:shadow-float">
          <AppHeader />
          {/* The rail and the dock change axis at different widths, so they are
            not siblings in one row: the rail moves beside the content at
            `lg`, the width where the content's own regions go two-column and
            a strip across the top would eat their height; the dock becomes a third column at `xl`. Below `xl` the
            scroller is the wrapper around content + dock, so the dock scrolls
            with the page it summarizes. `Screens/Frame` shows each arrangement.

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
                     xl:grid-cols-[12rem_minmax(0,1fr)_286px] xl:has-[[data-workspace]]:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <Nav />
            <Version />
            <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto lg:col-start-2 lg:row-start-1 xl:contents">
              <ContentPanel>{children}</ContentPanel>
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
    </>
  );
}
