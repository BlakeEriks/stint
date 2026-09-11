'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavTimer } from './nav-timer';

const LINKS = [
  { href: '/', label: 'Timer' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/clients', label: 'Clients' },
  { href: '/settings', label: 'Settings' },
];

/**
 * Deliberately plain: the accent belongs to the running timer, so navigation
 * marks the current section with weight and a neutral rule instead of colour.
 */
export function Nav() {
  const pathname = usePathname();

  // Signed-out screens have nowhere to navigate to.
  if (pathname === '/signin' || pathname.startsWith('/auth')) return null;

  return (
    // Chrome on the ground, not a card: no border, no fill. The floating
    // panes below supply the structure that a divider used to.
    <nav aria-label="Sections">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 pt-2 sm:px-6">
        {LINKS.map(({ href, label }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex-none rounded-md px-2.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors sm:px-3 ${
                active
                  ? 'bg-surface-primary text-strong shadow-card'
                  : 'text-subtle hover:text-muted'
              }`}
            >
              {label}
            </Link>
          );
        })}

        {/* Right of the tabs, in space the row already had. */}
        <div className="ml-auto flex-none pl-2">
          <NavTimer onTimerScreen={pathname === "/"} />
        </div>
      </div>
    </nav>
  );
}
