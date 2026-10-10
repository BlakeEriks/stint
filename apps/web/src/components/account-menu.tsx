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
 * The account, in the header. The email *is* the account, so the one thing to
 * do with it is leave, and this is where sign-out lives.
 */
export function AccountMenu() {
  const { email, signOut, signingOut } = useAccount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        /* The menu item unmounts as the menu closes, so the trigger is what
           shows a sign-out waiting on the server. */
        aria-busy={signingOut}
        disabled={signingOut}
        /* Sizes to its content, not its container: `w-full` here stretches it
           across the header row and pushes the address under the avatar. */
        className="flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 type-meta
                   text-subtle outline-none hover:bg-surface-hover hover:text-muted
                   focus-visible:ring-2 focus-visible:ring-edge-focus disabled:opacity-60 sm:px-3"
      >
        <User aria-hidden className="size-4 flex-none" strokeWidth={1.75} />
        {/* Truncates rather than wraps: a long address must not push the rail
            wider or the menu taller. */}
        <span className="min-w-0 truncate">
          {signingOut ? 'Signing out…' : (email ?? 'Account')}
        </span>
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
