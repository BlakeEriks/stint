/**
 * The content column.
 *
 * Every screen had its own copy of `mx-auto max-w-3xl px-4 py-8 sm:px-6
 * sm:py-10`, which is how the calendar ended up silently different (`max-w-5xl`)
 * and how a padding change would have meant editing seven files.
 *
 * `wide` is for screens that are a grid rather than a column — the calendar's
 * seven days need the room, and capping them at prose width wastes the space
 * the rail was meant to free up.
 *
 * **The top padding is smaller on a phone**, because the nav is a different
 * object there. At `sm` and up the rail is *beside* the content, so the column
 * opens against the top of the frame and wants the full inset. Below `sm` the
 * nav is a horizontal strip directly above, and the same 32px stopped reading
 * as margin and started reading as a gap between two things that should feel
 * stacked. Only the top changes: the bottom still needs its clearance above
 * the docked timer bar, and the sides are unrelated to either.
 */
export function Page({
  wide = false,
  children,
}: {
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      /* The top inset follows the NAV's breakpoint (`lg`), not the page's own
         (`sm`). Where the nav is a horizontal strip directly above, 40px stops
         reading as margin and starts reading as a gap; where the rail is
         beside the content, the column opens against the top of the frame and
         wants the full inset. The horizontal padding is a separate question
         and still steps at `sm`. */
      className={`mx-auto px-4 pt-4 pb-8 sm:px-8 sm:pb-10 lg:pt-10 ${
        wide ? 'max-w-6xl' : 'max-w-3xl'
      }`}
    >
      {children}
    </main>
  );
}
