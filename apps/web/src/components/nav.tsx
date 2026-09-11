'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Timer' },
  { href: '/clients', label: 'Clients' },
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
      <div className="mx-auto flex max-w-3xl gap-1 px-4 pt-2 sm:px-6">
        {LINKS.map(({ href, label }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-md px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                active
                  ? 'bg-surface-primary text-strong shadow-card'
                  : 'text-subtle hover:text-muted'
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
