'use client';

import { LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccount } from '@/lib/client/use-account';

/**
 * The account, in the header.
 *
 * **Not a Profile page**, and now barely a menu: the email *is* the account —
 * there is no name, avatar or organisation — so the one thing left to do with
 * it is leave. Settings is a section in the rail, and the theme is a field
 * inside it.
 *
 * This is where sign-out lives. The app previously had none at all, anywhere:
 * you could get in and not out.
 */
export function AccountMenu() {
  const { email, signOut } = useAccount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        /* Sizes to its content, not its container: this sat at `w-full` when
           it lived at the foot of the rail, and in the header that stretched
           it across the row and pushed the address under the avatar. */
        className="flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 type-meta
                   text-subtle outline-none hover:bg-surface-hover hover:text-muted
                   focus-visible:ring-2 focus-visible:ring-edge-focus sm:px-3"
      >
        <User aria-hidden className="size-4 flex-none" strokeWidth={1.75} />
        {/* Truncates rather than wraps: a long address must not push the rail
            wider or the menu taller. */}
        <span className="min-w-0 truncate">{email ?? 'Account'}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-48">
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
