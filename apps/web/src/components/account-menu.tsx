'use client';

import Link from 'next/link';
import { LogOut, Settings, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccount } from '@/lib/client/use-account';

/**
 * The account, at the foot of the rail.
 *
 * **Not a Profile page.** Settings is entirely business configuration —
 * billing defaults, invoice identity, numbering, payment profiles — and none
 * of it is "who am I". A profile for a single-user app would hold an email, a
 * sign-out and eventually a theme: three items, not a page. The email *is*
 * the account; there is no name, avatar or organisation.
 *
 * Settings lives here rather than in the rail's section list because the rail
 * is places you go and Settings is configuration you visit rarely — it does
 * not belong in the same run of items as Home and Calendar.
 *
 * This is also where sign-out finally lives. The app previously had none at
 * all, anywhere: you could get in and not out.
 */
export function AccountMenu() {
  const { email, signOut } = useAccount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 type-meta
                   text-subtle outline-none hover:bg-surface-hover hover:text-muted
                   focus-visible:ring-2 focus-visible:ring-edge-focus sm:px-3"
      >
        <User aria-hidden className="size-4 flex-none" strokeWidth={1.75} />
        {/* Truncates rather than wraps: a long address must not push the rail
            wider or the menu taller. */}
        <span className="min-w-0 truncate">{email ?? 'Account'}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Signing out is not destructive — nothing is lost and signing back
            in is a click — so it does not ask. */}
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
