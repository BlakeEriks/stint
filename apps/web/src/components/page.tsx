'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef } from 'react';
import { Loader } from './loader';
import { ApiError } from '@/lib/client/api';
import { BackLink } from './back-link';

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
  workspace = false,
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
  /**
   * For a screen that is a tool rather than a page to read: it takes the
   * dock's room too. `AppShell` sees `data-workspace` and folds the dock to a
   * strip at `xl`, so a screen opts in here and the frame never checks a
   * route.
   */
  workspace?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      data-workspace={workspace || undefined}
      className={`mx-auto ${flush ? '' : `${INSET} py-[18px] `}${
        workspace ? 'max-w-none' : wide ? 'max-w-6xl' : 'max-w-3xl'
      }${fills ? ' xl:flex xl:h-full xl:min-h-0 xl:flex-col' : ''}`}
    >
      {children}
    </main>
  );
}

/**
 * A detail screen: a back link, then the content. `back` is where this record
 * sits, and where the link goes when the reader came from there or from
 * outside the app; otherwise it returns to the section they came from.
 */
export function DetailPage({
  back,
  label,
  workspace = false,
  fills = false,
  children,
}: {
  back: string;
  label: string;
  workspace?: boolean;
  /** `Page`'s: the content below the back link takes the rest of the panel. */
  fills?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Page workspace={workspace} fills={fills}>
      <BackLink up={back} label={label} />
      <div
        className={`mt-4${fills ? ' xl:flex xl:min-h-0 xl:flex-1 xl:flex-col' : ''}`}
      >
        {children}
      </div>
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
 * The message standing in for rows: nothing to show, or a failure. Loading is
 * `Loader`'s.
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

/** What `Listing` reads off a query. */
type Query<T> = { data: T | undefined; error: unknown; isLoading: boolean };
type DataOf<Q> = Q extends { data: infer D } ? Exclude<D, undefined> : never;
type Loaded<Q> = Q extends readonly Query<unknown>[]
  ? { -readonly [K in keyof Q]: DataOf<Q[K]> }
  : DataOf<Q>;

/**
 * A region's non-answers, then its data. The failure message is neutral,
 * never red: a list that could not load is a condition, and the answer is to
 * try again.
 *
 * Given several queries, the region renders only once every one of them has
 * data, and its children get them as a tuple: a region paints once, with all
 * of it, never with a `?? []` standing in for a query still on its way.
 *
 * `empty` is the message for data that arrived and holds nothing — omit it
 * where the record is a single object, which is never empty, only missing.
 * With several queries, it reads the first.
 */
export function Listing<
  const Q extends Query<unknown> | readonly Query<unknown>[],
>({
  query,
  empty,
  missing,
  tight = false,
  children,
}: {
  query: Q;
  empty?: React.ReactNode;
  /** What a 404 says, where the screen is about one record. */
  missing?: React.ReactNode;
  tight?: boolean;
  children: (data: Loaded<Q>) => React.ReactNode;
}) {
  const queries: readonly Query<unknown>[] = Array.isArray(query)
    ? query
    : [query as Query<unknown>];
  const waited = useRef(false);

  /* A 401 has already sent the browser to `/signin`. Reporting a failure over
     the top of a navigation in flight tells the user something is broken when
     nothing is. */
  const leaving = queries.some(
    (q) => q.error instanceof ApiError && q.error.isUnauthorized,
  );

  /* No data and no error is a wait, whether or not a fetch is in flight:
     while the kept cache is restored a query is pending without fetching. */
  const waiting = queries.some(
    (q) => q.isLoading || (q.data === undefined && q.error == null),
  );
  if (waiting || leaving) {
    waited.current = true;
    return <Loader tight={tight} />;
  }
  /* Data the user can still read beats an error message in its place: a failed
     REFETCH would otherwise replace a form mid-edit and take the unsent text
     with it. */
  const failed = queries.find((q) => q.data === undefined);
  if (failed) {
    const gone =
      missing !== undefined &&
      failed.error instanceof ApiError &&
      failed.error.status === 404;
    return (
      <Empty tight={tight}>
        {gone ? missing : 'Could not load this. Try again.'}
      </Empty>
    );
  }
  if (empty !== undefined && isEmpty(queries[0]!.data)) {
    return <Empty tight={tight}>{empty}</Empty>;
  }
  const data = (
    Array.isArray(query)
      ? queries.map((q) => q.data)
      : (query as Query<unknown>).data
  ) as Loaded<Q>;
  return <RiseIn after={waited}>{children(data)}</RiseIn>;
}

/**
 * The content rising in once, where it replaces the loader: a short settle,
 * never a fade, so no frame of it is ever drawn faint (a figure read at half
 * opacity is a figure misread).
 *
 * Animated through the elements it rendered rather than a wrapper: a wrapper
 * would sit between a `fills` screen's column and its `flex-1` child and break
 * the height chain. A sentinel marks where the content starts.
 */
function RiseIn({
  after,
  children,
}: {
  after: React.RefObject<boolean>;
  children: React.ReactNode;
}) {
  const mark = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!after.current) return;
    after.current = false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = getComputedStyle(document.documentElement);
    const rise = root.getPropertyValue('--motion-rise').trim() || '3px';
    for (
      let el = mark.current?.nextElementSibling;
      el;
      el = el.nextElementSibling
    ) {
      el.animate?.(
        [{ transform: `translateY(${rise})` }, { transform: 'none' }],
        {
          duration:
            Number.parseFloat(root.getPropertyValue('--motion-quick')) || 160,
          easing:
            root.getPropertyValue('--ease-decelerate').trim() || 'ease-out',
        },
      );
    }
  }, [after]);
  return (
    <>
      <span ref={mark} hidden />
      {children}
    </>
  );
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
