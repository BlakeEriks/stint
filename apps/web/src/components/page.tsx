import Link from 'next/link';

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

/**
 * A detail screen: a back link, then the content.
 *
 * `client-detail`, `invoice-detail` and `invoice-new` each had their own copy,
 * two of them byte-identical and the third inlined without a wrapper at all.
 *
 * **`back` is where this record sits, not where you came from.** The arrow
 * and the position promise "back" while the hardcoded href means "up", so
 * arriving from the home inbox and clicking it lands on a list you were never
 * on. `tasks.md` carries the fix — a `from` param, resolved at render time —
 * and it is one change here rather than three once it happens, which is the
 * argument for this component existing at all.
 */
export function DetailPage({
  back,
  label,
  wide = false,
  children,
}: {
  back: string;
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Page wide={wide}>
      <Link href={back} className="type-label text-subtle hover:text-muted">
        ← {label}
      </Link>
      <div className="mt-4">{children}</div>
    </Page>
  );
}

/**
 * A card that holds rows, or one message where rows would be.
 *
 * `edge` draws the client's colour down the whole left edge — the panel is
 * that client's work, so the edge says so for every row at once.
 *
 * **`edge` is opt-in, and a null colour still reserves the rail.** A group of
 * panels has to align whether or not each client has a colour, and "No
 * client" is a grouping rather than a record, so it gets the space and no
 * colour — the same rule the headings follow. A panel that is not part of
 * such a group (a loading or empty message) omits `edge` entirely and has no
 * rail to align with.
 */
export function Panel({
  edge = false,
  color,
  children,
}: {
  edge?: boolean;
  color?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card${
        edge ? ' border-l-2' : ''
      }`}
      style={edge && color ? { borderLeftColor: color } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * The message standing in for rows: loading, or nothing to show.
 *
 * `tight` is the in-page variant — today's entries sit under a heading that
 * already has space above it, where a list filling its own panel does not.
 */
export function Empty({
  tight = false,
  children,
}: {
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p
      className={`px-4 text-center type-support text-subtle ${
        tight ? 'py-8' : 'py-10'
      }`}
    >
      {children}
    </p>
  );
}
