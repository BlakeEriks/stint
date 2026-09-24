import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import { INSET } from './page';

/**
 * Every client by id — resolved once in `Panel` and passed down.
 *
 * `color` is nullable because the column is: a client without one takes
 * `INTERNAL_SWATCH`, same as work with no client at all.
 */
export type Clients = Map<
  string,
  { id: string; name: string; color: string | null }
>;

/**
 * A client that appears somewhere on the panel, with the hue it takes
 * everywhere on it.
 *
 * `color` is null for internal work, which has no client and therefore no
 * hue: the absence is the answer, and the hollow ring is what draws it.
 */
export interface Hue {
  /** `''` for internal work — the key `/calendar`'s `byClient` uses. */
  id: string;
  name: string;
  color: string | null;
}

/** The key internal work takes in every by-client map on this screen. */
export const INTERNAL = '';

/**
 * Every hue the panel uses, in ONE order, resolved once for all three places
 * that draw it.
 *
 * A hue belongs to the client, never to the position: the same client is the
 * same colour in the week's bars, the month's strip and the legend. Built
 * here rather than per region because two regions each deriving their own
 * order is two orders to keep in agreement, and the moment they disagree the
 * palette means nothing (`docs/design/screens/home.html`).
 *
 * The order is the month's money, descending, then any client that worked
 * this week without earning yet, by id. Deterministic either way — a `Map`
 * iterates in insertion order, so the legend, the strip and every bar walk
 * the same sequence on every render.
 *
 * Internal work sorts LAST wherever it appears: it takes no hue, so leading
 * with it would put the neutral segment under every coloured one.
 */
export function buildHues({
  byClient,
  weekKeys,
  clients,
}: {
  /** The month's bands, already ordered by money. */
  byClient: { clientId: string | null; clientName: string }[];
  /** Client keys present in the week's bars, which the month may not hold. */
  weekKeys: Iterable<string>;
  clients: Clients;
}): Map<string, Hue> {
  const hues = new Map<string, Hue>();
  /* Internal work is held back rather than skipped: it belongs in the legend
     and at the foot of every stack, after everything with a colour. */
  let internal: Hue | null = null;

  const add = (key: string, fallbackName: string) => {
    if (key === INTERNAL) {
      internal ??= { id: INTERNAL, name: 'Internal', color: null };
      return;
    }
    if (hues.has(key)) return;
    const client = clients.get(key);
    hues.set(key, {
      id: key,
      name: client?.name ?? fallbackName,
      /* Null, not a grey: a client whose colour column is empty draws the
         same absence internal work does, rather than a grey pretending to be
         a hue. */
      color: client?.color ?? null,
    });
  };

  // The month's money first, which is the order the strip is already in.
  for (const c of byClient) add(c.clientId ?? INTERNAL, c.clientName);
  // Then anyone who worked this week without earning — sorted, so the order
  // does not depend on which day the rollup happened to return first.
  for (const key of [...weekKeys].sort()) add(key, 'Unknown client');

  if (internal) hues.set(INTERNAL, internal);
  return hues;
}

/**
 * How a figure says it is INCOMPLETE: some of the work under it has no rate,
 * so the money shown is less than the money earned.
 *
 * One phrasing, because a figure marked `3 unrated` in one region and
 * `3 no rate` in another reads as two different conditions. Returns null when
 * there is nothing to mark, so a caller renders it unconditionally.
 */
export function unratedNote(count: number): string | null {
  return count > 0 ? `${count} unrated` : null;
}

/**
 * The period header, naming a region.
 *
 * `type-nav`'s size and weight in sentence case: the scale has no 13px mono
 * role that is not tracked caps, and caps here would put the header in
 * `type-label`'s voice directly above a `type-label`. Two label voices, two
 * jobs — the header names the region, the label names a number.
 */
export function RegionHead({ children }: { children: React.ReactNode }) {
  /* `type-region-head` is the role: `type-nav`'s size and weight in sentence
     case, which is what keeps the header out of `type-label`'s voice directly
     above a `type-label`. */
  return (
    <span className="block type-region-head leading-none text-subtle">
      {children}
    </span>
  );
}

/**
 * A label and the figure under it, with the gap corrected per tier.
 *
 * A larger glyph sits deeper in its own line box, so equal margins read as
 * unequal ink. Set here, once, and never at a call site.
 */
export function FigGroup({
  tier,
  className = '',
  children,
}: {
  tier: 'hero' | 'major' | 'minor';
  className?: string;
  children: React.ReactNode;
}) {
  const gap = {
    hero: '[&>:first-child+*]:mt-[5px]',
    major: '[&>:first-child+*]:mt-[4px]',
    minor: '[&>:first-child+*]:mt-[5px]',
  }[tier];

  return <div className={`flex flex-col ${gap} ${className}`}>{children}</div>;
}

/** The figure label: 11px mono, tracked caps, naming the number beneath it. */
export function FigLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block type-label leading-none text-subtle">
      {children}
    </span>
  );
}

/** A figure and its quiet second unit on one baseline. */
export function PairLine({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`flex min-w-0 items-baseline gap-2 ${className}`}>
      {children}
    </span>
  );
}

/**
 * A 9px round pip — the client's colour, or a hollow ring for internal work.
 *
 * Distinct from `Swatch`, which is square and fills grey when it has no
 * colour: this screen draws the ABSENCE as a ring, because a filled grey dot
 * beside filled coloured ones reads as a client whose colour is grey.
 */
export function Pip({ color }: { color?: string | null }) {
  if (color) {
    return (
      <span
        aria-hidden
        className="size-[9px] flex-none rounded-full"
        style={{ backgroundColor: color }}
      />
    );
  }
  return (
    <span
      aria-hidden
      data-pip="internal"
      className="size-[9px] flex-none rounded-full border-[1.5px] border-edge-default"
      style={{ borderColor: INTERNAL_SWATCH }}
    />
  );
}

/**
 * ONE legend, at the foot of the panel, naming every hue drawn above it.
 *
 * The bars and the strip draw from one set of clients, so two keys would be
 * a second thing to keep in agreement. Internal work appears here with its
 * hollow ring, because a reader who sees the treatment needs somewhere to
 * find out what it means (`docs/design/screens/home.html`).
 */
export function Legend({ hues }: { hues: Map<string, Hue> }) {
  if (hues.size === 0) return null;

  return (
    <ul
      data-legend="clients"
      className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-edge-subtle pt-3.5"
    >
      {[...hues.values()].map((h) => (
        <li
          key={h.id || 'internal'}
          data-legend-key={h.id || 'internal'}
          className="inline-flex items-center gap-[7px] type-meta text-subtle"
        >
          <Pip color={h.color} />
          {h.name}
        </li>
      ))}
    </ul>
  );
}

export function Row({
  href,
  icon,
  label,
  detail,
  value,
}: {
  href: string;
  icon?: React.ReactNode;
  label: string;
  detail: string;
  /* A node, not a string: a row's amount tweens to its new value like the
     figure it breaks down, and a plain string cannot hold its own state. */
  value: React.ReactNode;
}) {
  /* Sized by CONTAINER, not viewport — the same row renders in Home's wide
     panel and in the narrow dock, where a `sm:` breakpoint is true at 1600px
     and lays the row out as though there were room. */
  return (
    <li className="@container">
      <div className="flex items-center gap-2.5 py-2">
        {icon}

        {/* One line: the name, then the age against the money it is ageing.
            Stacked under the name the age read as part of the client rather
            than as a property of the amount, and cost the row a second line
            it did not need. */}
        <Link
          href={href}
          className="min-w-0 flex-1 truncate rounded-sm type-control text-primary hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
        >
          {label}
        </Link>

        <span className="flex-none truncate type-meta text-subtle">
          {detail}
        </span>
        {/* The fixed `w-24` makes the amounts a column where there is room;
            auto-width in a narrow panel. */}
        <span className="flex-none text-right type-duration text-primary @md:w-24">
          {value}
        </span>

        <ArrowRight aria-hidden className="size-3.5 flex-none text-subtle" />
      </div>
    </li>
  );
}

/**
 * A region of the panel, in one of two header modes, selected by `value`.
 *
 * A region whose point is one figure demotes its title to a quiet `type-label`
 * above the figure; a region whose point is a list keeps its heading, having no
 * figure to be subordinate to.
 *
 * No border, no background, no shadow: the panel around it carries all three,
 * and a second set inside it reads as a card in a card.
 */
export function Region({
  title,
  icon: Icon,
  value,
  labelled = false,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  /** The region's subject. Supplying it demotes the title — see above. */
  value?: React.ReactNode;
  /**
   * Demote the title without a figure, for a region whose subject is a
   * picture.
   */
  labelled?: boolean;
  /** A single quiet control, top-right against the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (value !== undefined || labelled) {
    return (
      <section className="py-1">
        <header className={`${INSET} pt-3 pb-2`}>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Icon
                aria-hidden
                strokeWidth={1.75}
                className="size-3.5 flex-none text-subtle"
              />
              <h2 className="type-label truncate text-subtle">{title}</h2>
            </div>
            {action ? <div className="flex-none">{action}</div> : null}
          </div>
          {/* `leading-none`: no type role sets a line-height, so the inherited
              1.5 leaves ~7px of empty leading under a 30px figure and the line
              beneath it reads as drifting. */}
          {value !== undefined ? (
            <div className="mt-1.5 type-figure leading-none text-strong">
              {value}
            </div>
          ) : null}
        </header>
        {children}
      </section>
    );
  }

  return (
    <section className="py-1">
      <header className={`flex items-center gap-2 ${INSET} pt-3 pb-2.5`}>
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className="size-4 flex-none text-muted"
        />
        <h2 className="type-heading flex-1 truncate text-strong">{title}</h2>
        {action ? <div className="flex-none">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
