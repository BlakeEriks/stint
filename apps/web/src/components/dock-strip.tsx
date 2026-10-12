'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Inbox as InboxIcon } from 'lucide-react';
import { Popover } from 'radix-ui';
import { api } from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';
import { useDockFold, type FoldRegion } from '@/lib/client/use-dock-fold';
import { timeZone as tz, useTimer } from '@/lib/client/use-timer';
import { Button } from '@/components/ui/button';
import { EntryList } from './entry-list';
import { Inbox, inboxCount } from './inbox';
import { Listing } from './page';

/**
 * The dock, folded: on a workspace screen at `xl`, a 44px strip where the
 * dock's column was, so the screen keeps the room and the Inbox stays one
 * press away with its count in view (#207, option B of the workspace review).
 *
 * Each icon opens its region over the panel as a non-modal popover: Escape,
 * a press outside, focus leaving or a navigation closes it, and focus returns
 * to the icon. Not a dialog: it is a glance beside the work, not a step the
 * work waits on, so it neither traps focus nor dims the screen.
 *
 * Icon-only by design, the third exception in `.claude/rules/web-ui.md`:
 * each carries its name, and the Inbox its count, in `aria-label`.
 */
export function DockStrip() {
  const { open, setOpen } = useDockFold();
  const timer = useTimer();
  const stats = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });
  const { data: projects } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });
  const count = stats.data ? inboxCount(stats.data.attention) : 0;

  const fold = (region: FoldRegion) => ({
    open: open === region,
    onOpenChange: (next: boolean) => setOpen(next ? region : null),
  });

  return (
    <aside
      aria-label="Inbox and Today"
      className="hidden flex-col items-center gap-1.5 pt-2 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:group-has-[[data-workspace]]/app:flex"
    >
      <Popover.Root {...fold('inbox')}>
        <Icon
          label={
            count
              ? `Inbox, ${count} ${count === 1 ? 'item' : 'items'}`
              : 'Inbox'
          }
          title="Inbox"
        >
          <InboxIcon aria-hidden strokeWidth={1.75} />
          {/* The dock's own count pill, on the icon's corner; none at zero,
              where the open Inbox says "Nothing needs you." */}
          {count ? (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-surface-active px-1 type-meta text-strong"
            >
              {count}
            </span>
          ) : null}
        </Icon>
        <Fold label="Inbox">
          <Listing query={stats}>{(data) => <Inbox stats={data} />}</Listing>
        </Fold>
      </Popover.Root>

      <Popover.Root {...fold('today')}>
        <Icon label="Today" title="Today">
          <CalendarDays aria-hidden strokeWidth={1.75} />
        </Icon>
        <Fold label="Today">
          <EntryList
            projects={projects?.projects ?? []}
            todaySeconds={timer.todaySeconds}
            earnedToday={stats.data?.earnedToday}
            currency={stats.data?.currency}
            flush
          />
        </Fold>
      </Popover.Root>
    </aside>
  );
}

function Icon({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Popover.Trigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        title={title}
        className="relative text-muted data-[state=open]:bg-surface-active data-[state=open]:text-strong [&_svg:not([class*='size-'])]:size-[18px]"
      >
        {children}
      </Button>
    </Popover.Trigger>
  );
}

/**
 * The open region, over the panel to the strip's left and the dock's width.
 *
 * On the ground the dock is painted on, not a raised surface: the Inbox's
 * rows carry the elevated fill, and on an elevated popover they would vanish
 * into it. The border and the float shadow are what lift it off the panel.
 */
function Fold({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Popover.Portal>
      <Popover.Content
        side="left"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        aria-label={label}
        className="z-40 flex max-h-(--radix-popover-content-available-height) w-[286px] flex-col overflow-y-auto rounded-xl border border-edge-subtle bg-surface-base p-3 shadow-float"
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}
