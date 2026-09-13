'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  FileText,
  FolderOpen,
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
  // Settings is NOT here: the rail is places you go, and configuration you
  // visit rarely belongs in the account menu at the foot instead.
];

/**
 * A vertical rail.
 *
 * Horizontal nav was running out of room: five items plus the running timer
 * already needed `overflow-x-auto` on narrow viewports, and the roadmap adds
 * more. A rail grows downward, where there is space, instead of sideways,
 * where there is not.
 *
 * It also stops the content column fighting the viewport. Centred `max-w`
 * pages left wide monitors mostly empty; with the rail holding the left edge
 * the calendar in particular gets the width it wants.
 *
 * Deliberately plain: the accent belongs to the running timer, so the current
 * section is marked with weight and a raised surface rather than colour.
 *
 * The rail sits on `bg-surface-base`, one step below the content column and
 * one step ABOVE `bg-surface-recessed`, which carries the header and the
 * timer bar. Two chrome levels, not one: those two strips bound the whole
 * app, the rail and the dock bound the content. The active pill is
 * `bg-surface-primary` — the content surface — so it reads as raised against
 * the rail rather than as a slightly different grey. In light mode the order
 * inverts (the rail goes darker than the page) and means the same thing.
 *
 * **Below `lg` it is a horizontal strip under the header**, not a rail. The
 * rail costs a fixed 208px whatever the window, and below 1024 the content is
 * still a single column — so at 900px it was spending 208px to hold 183px of
 * labels while the cards made do with 692. `lg` is where the cards go
 * two-column and the width starts being used rather than just occupied.
 *
 * The strip needs 596px for five sections, so it fits comfortably at every
 * width where it is shown; past that it scrolls horizontally rather than
 * wrapping, which is what keeps the header row one row tall.
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
      className="flex flex-none flex-col gap-1 border-b border-edge-subtle bg-surface-base px-3 py-2
                 lg:h-full lg:w-52 lg:border-r lg:border-b-0 lg:py-4"
    >
      {/* Sections, and nothing else. The wordmark and the account menu moved
          to the header, and the running timer to the docked bar — so the rail
          is now purely places you go, which is what it always claimed to be.

          Only this scrolls: horizontally on a phone, vertically in the rail
          if the list ever outgrows a short window. */}
      <div className="flex gap-1 overflow-x-auto lg:min-h-0 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`type-nav flex flex-none items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors lg:px-3 ${
                active
                  ? 'bg-surface-primary text-strong shadow-card'
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
    </nav>
  );
}
