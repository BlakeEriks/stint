import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

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
/** The same figure as a margin, for a rule that stops short of the edges. */
export const INSET_X = 'mx-[18px]';

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
   * picture. Month is the one: its answer is the shape of the line against
   * the ray, and a heading would announce it louder than the thing it names.
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
  value: string;
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
