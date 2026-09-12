'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavTimer } from './nav-timer';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/clients', label: 'Clients' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/settings', label: 'Settings' },
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
 * On a phone it returns to a horizontal strip — a rail would eat a third of a
 * 375px viewport, and the timer hero is what that screen is for.
 */
export function Nav() {
  const pathname = usePathname();

  // Signed-out screens have nowhere to navigate to.
  if (pathname === '/signin' || pathname.startsWith('/auth')) return null;

  return (
    <nav
      aria-label="Sections"
      className="flex flex-none flex-col gap-1 border-b border-edge-subtle px-3 py-2
                 sm:w-52 sm:border-r sm:border-b-0 sm:py-4"
    >
      {/* Wordmark doubles as the Home link, which is the convention the
          logo-click already implies. `order-first` on mobile keeps it left of
          the section strip. */}
      {/* Identity row. On a phone the timer sits beside the wordmark so it
          survives the horizontal scroll below; in the rail they stack. */}
      <div className="flex flex-none items-center justify-between gap-2 sm:flex-col sm:items-start sm:gap-1">
        <Link
          href="/"
          aria-label="Stint — home"
          className="type-wordmark flex-none rounded-md px-2 py-1 text-strong
                     hover:bg-surface-hover"
        >
          Stint
        </Link>
        <div className="min-w-0 flex-none sm:mb-3 sm:w-full">
          <NavTimer onTimerScreen={pathname === '/'} />
        </div>
      </div>

      {/* Sections. Only this scrolls on a phone. */}
      <div className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
        {LINKS.map(({ href, label }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`type-nav flex-none rounded-md px-2.5 py-2 transition-colors sm:px-3 ${
                active
                  ? 'bg-surface-primary text-strong shadow-card'
                  : 'text-muted hover:text-strong hover:bg-surface-hover'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
