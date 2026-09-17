import Link from 'next/link';
import { ApiError } from '@/lib/client/api';

/**
 * The content column. No screen sets its own width; `wide` is for screens that
 * are a grid rather than a column.
 */
export function Page({
  wide = false,
  flush = false,
  fills = false,
  children,
}: {
  wide?: boolean;
  /**
   * For a screen whose content IS the panel rather than sitting on it.
   *
   * This padding is inset from the frame, and the panel is the frame's
   * surface — so on such a screen it lands INSIDE the panel and doubles
   * whatever inset the regions already carry. The panel owns its own.
   */
  flush?: boolean;
  /**
   * For a screen that owns a scroll of its own: the column takes the panel's
   * height instead of its content's, so a child measuring `flex-1` measures
   * against the panel. Opt-in, because a screen that reads as a column wants
   * the frame's single scroll and nothing else.
   *
   * It starts at `xl`, where the panel becomes a bounded scroller; below it
   * the panel is sized by its content inside a scrolling column, so a
   * full-height column here would resolve against nothing.
   */
  fills?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      /* The top inset follows the NAV's breakpoint (`lg`), not the page's own
         (`sm`): where the nav is a horizontal strip directly above, the full
         inset reads as a gap rather than as margin. */
      className={`mx-auto ${
        flush ? '' : 'px-4 pt-4 pb-8 sm:px-8 sm:pb-10 lg:pt-10 '
      }${wide ? 'max-w-6xl' : 'max-w-3xl'}${
        fills ? ' xl:flex xl:h-full xl:min-h-0 xl:flex-col' : ''
      }`}
    >
      {children}
    </main>
  );
}

/**
 * A detail screen: a back link, then the content. `back` is where this record
 * sits, not where you came from.
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
 * `edge` draws the client's colour down the left edge. It is opt-in and a null
 * colour still reserves the rail, so a group of panels aligns whether or not
 * each client has a colour.
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

/**
 * A query's non-answers, then its data. The failure message is neutral, never
 * red: a list that could not load is a condition, and the answer is to try
 * again.
 *
 * `empty` is the message for data that arrived and holds nothing — omit it
 * where the record is a single object, which is never empty, only missing.
 */
export function Listing<T>({
  query,
  empty,
  missing,
  tight = false,
  panel = false,
  children,
}: {
  query: { data: T | undefined; error: unknown; isLoading: boolean };
  empty?: React.ReactNode;
  /** What a 404 says, where the screen is about one record. */
  missing?: React.ReactNode;
  tight?: boolean;
  /**
   * Wrap the MESSAGE in a panel, for a list whose rows are cards of their
   * own — a panel around those would nest a card inside a card.
   */
  panel?: boolean;
  children: (data: T) => React.ReactNode;
}) {
  const message = (text: React.ReactNode) => {
    const p = <Empty tight={tight}>{text}</Empty>;
    return panel ? <Panel>{p}</Panel> : p;
  };

  /* A 401 has already sent the browser to `/signin`. Reporting a failure over
     the top of a navigation in flight tells the user something is broken when
     nothing is. */
  const leaving = query.error instanceof ApiError && query.error.isUnauthorized;

  if (query.isLoading || leaving) return message('Loading…');
  /* Data the user can still read beats an error message in its place: a failed
     REFETCH would otherwise replace a form mid-edit and take the unsent text
     with it. */
  if (query.data === undefined) {
    const gone =
      missing !== undefined &&
      query.error instanceof ApiError &&
      query.error.status === 404;
    return message(gone ? missing : 'Could not load this. Try again.');
  }
  if (empty !== undefined && isEmpty(query.data)) return message(empty);
  return <>{children(query.data)}</>;
}

/** An empty array is the only "nothing" a `Listing` decides on its own. */
function isEmpty(data: unknown) {
  return Array.isArray(data) && data.length === 0;
}

/**
 * The filter above a list, as links.
 *
 * The filter lives in the URL rather than in local state, so the view is
 * linkable and Back returns to it. `null` is the default view, which carries
 * no query at all.
 */
export function FilterTabs({
  base,
  active,
  tabs,
}: {
  /** The list's own path, e.g. `/clients`. */
  base: string;
  /** The current `status` param, or null for the default view. */
  active: string | null;
  tabs: { key: string | null; label: string }[];
}) {
  return (
    <nav aria-label="Filter" className="flex gap-1">
      {tabs.map(({ key, label }) => {
        const on = key === active;
        return (
          <Link
            key={label}
            href={key ? `${base}?status=${key}` : base}
            aria-current={on ? 'page' : undefined}
            className={`rounded-md px-2 py-1 type-label ${
              on
                ? 'bg-surface-elevated text-strong'
                : 'text-subtle hover:text-muted'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
