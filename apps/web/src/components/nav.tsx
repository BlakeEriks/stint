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
    <nav
      aria-label="Sections"
      className="border-b border-edge-subtle bg-surface-base"
    >
      <div className="mx-auto flex max-w-3xl gap-1 px-4 sm:px-6">
        {LINKS.map(({ href, label }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-3 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                active
                  ? 'border-edge-control text-strong'
                  : 'border-transparent text-subtle hover:text-muted'
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
