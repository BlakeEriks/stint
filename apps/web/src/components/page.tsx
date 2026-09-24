import Link from 'next/link';
import { ApiError } from '@/lib/client/api';

/**
 * The panel's one spacing number, on all four sides of every region.
 *
 * It is the outer margin, the rules' own inset, and — because the pairing grid
 * carries no gutter — half the gap between two halves. Two regions side by side
 * sit apart by exactly twice what either sits from the panel's edge, which is
 * the spacing the outer margin already implies.
 *
 * A grid gutter on top of this is a second number governing the same gap, and
 * the two drift: at a 16px gutter the middle read 2.8x the margin.
 *
 * Off Tailwind's scale at 18px deliberately — 20 (`5`) leaves the middle wide,
 * 16 (`4`) crowds the panel's corner.
 */
export const INSET = 'px-[18px]';

/**
 * The content column. No screen sets its own width; `wide` is for screens that
 * are a grid rather than a column.
 *
 * Its padding is `INSET` on every side, so a region's rule — which spans the
 * column — stops that far short of the panel's edges.
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
      className={`mx-auto ${flush ? '' : `${INSET} py-[18px] `}${
        wide ? 'max-w-6xl' : 'max-w-3xl'
      }${fills ? ' xl:flex xl:h-full xl:min-h-0 xl:flex-col' : ''}`}
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
 * A region of the panel: rows, or one message where rows would be, under an
 * inset rule.
 *
 * No border, no background, no shadow: the panel around it carries all three,
 * and a second set inside it reads as a card in a card. Its rows are split by
 * rules of their own (`divide-y`), never boxed.
 */
export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-edge-subtle">{children}</div>;
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
  children,
}: {
  query: { data: T | undefined; error: unknown; isLoading: boolean };
  empty?: React.ReactNode;
  /** What a 404 says, where the screen is about one record. */
  missing?: React.ReactNode;
  tight?: boolean;
  children: (data: T) => React.ReactNode;
}) {
  const message = (text: React.ReactNode) => (
    <Empty tight={tight}>{text}</Empty>
  );

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
