'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  FileText,
  FolderOpen,
  Settings,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';

/* Icon AND label, never icon alone. An icon is a fast second channel for
   somewhere you already know, and useless for somewhere you do not — the
   label is what makes it findable the first time. lucide-react is already a
   dependency (shadcn's dialog and dropdown use it), so this costs nothing. */
const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'Home', icon: Timer },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  /* Last: the sections above are the work, this is the setup behind it. */
  { href: '/settings', label: 'Settings', icon: Settings },
];

/**
 * A vertical rail of sections.
 *
 * The accent belongs to the running timer, so the current section is marked
 * with fill and a marker rather than colour.
 *
 * The rail is painted straight onto the ground: no surface of its own and no
 * rule beside it. The active item is therefore read as a selected OBJECT —
 * a translucent pill with a bar at its left edge — rather than by a shared
 * edge with anything.
 *
 * **Below `lg` it is a horizontal strip under the header**, scrolling
 * horizontally rather than wrapping, which keeps the row one row tall however
 * many sections it holds.
 */
export function Nav() {
  const pathname = usePathname();

  // Signed-out screens have nowhere to navigate to.
  if (pathname === '/signin' || pathname.startsWith('/auth')) return null;

  return (
    <nav
      aria-label="Sections"
      /* `h-full`, not `h-dvh`: the frame is now a column with the timer
         docked beneath, so the rail fills its own row rather than the
         viewport — at `h-dvh` it would run under the bar by the bar's own
         height. */
      className="flex flex-none flex-col gap-1 lg:col-start-1 lg:row-start-1 lg:h-full lg:w-52"
    >
      {/* Only this scrolls: horizontally on a phone, vertically in the rail if
          the list ever outgrows a short window. */}
      <div className="flex gap-1 overflow-x-auto lg:min-h-0 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              /* The active item is a translucent pill with a 2px marker at
                 its left edge, drawn as `::before` — no shadow, because on a
                 flat ground a raised pill would be the second floating thing
                 in the frame and the panel is the first. */
              className={`type-nav relative flex flex-none items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors lg:px-3 ${
                active
                  ? `bg-surface-elevated/55 text-strong
                     before:absolute before:top-1/2 before:left-0 before:h-3.5 before:w-0.5
                     before:-translate-x-px before:-translate-y-1/2 before:rounded-full
                     before:bg-edge-control before:content-['']`
                  : 'text-muted hover:text-strong hover:bg-surface-hover'
              }`}
            >
              <Icon
                aria-hidden
                className="size-4 flex-none"
                strokeWidth={1.75}
              />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Bottom-left, and only where the rail is a column: on a phone the nav
          is a scrolling strip with no bottom to sit at. It names the build
          being looked at, which is what makes a bug report actionable. */}
      <span className="mt-auto hidden px-3 pb-1 type-meta text-subtle lg:block">
        v{process.env.NEXT_PUBLIC_APP_VERSION}
      </span>
    </nav>
  );
}
