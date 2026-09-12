import { Providers } from '@/components/providers';
import { Nav } from '@/components/nav';
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
      {/* The rail and the content sit side by side, so the content area
          is a real column rather than the whole viewport with padding.

          On the rail breakpoint the PAGE does not scroll — `h-dvh` plus
          `overflow-hidden` pins it — and the content column scrolls inside
          itself instead. The rail is a sibling of that scroller rather
          than inside it, so it simply stays put; nothing is positioned
          fixed and nothing needs a scroll offset.

          Below `sm` the nav is a horizontal strip above the content, and
          there the whole page scrolls normally: pinning a strip that is
          already two rows tall would eat a third of a phone viewport. */}
      {/* The frame is a column: rail + content on top, timer docked beneath.

          The timer is part of the frame rather than a card on one screen,
          so it is present on every route and a timer can be started from
          anywhere. It is a flex sibling rather than `position: fixed` — the
          content column then simply ends above it, with no reserved padding
          to keep in sync and nothing overlapping the last row of a list.

          On a phone the whole page still scrolls, so the bar is `sticky`
          there instead: it has to stay reachable without pinning a viewport
          that is mostly keyboard once the input has focus. */}
      <div className="flex min-h-dvh flex-col sm:h-dvh sm:min-h-0 sm:overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <Nav />
          <div className="min-w-0 flex-1 sm:overflow-y-auto">{children}</div>
        </div>
        <div className="sticky bottom-0 z-20 sm:static">
          <TimerDock />
        </div>
      </div>
    </Providers>
  );
}
