'use client';

import { useQuery } from '@tanstack/react-query';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { api } from '@/lib/client/api';
import { keys } from '@stint/client';
import { setDockFolded } from '@/lib/client/dock-fold';
import { timeZone as tz } from '@/lib/client/use-timer';
import { Button } from '@/components/ui/button';
import { inboxCount } from './inbox';

/**
 * The dock, folded by the user at `xl`: a 44px strip where the dock's column
 * was, with the Inbox's count in view and the button that unfolds it.
 *
 * It shows only while `<html>` carries `data-dock-folded`, read by CSS, as the
 * dock and the frame's column width are. Below `xl` the dock is a band under
 * the content and the choice does not apply.
 *
 * Icon-only by design, an exception in `.claude/rules/web-ui.md`: the button
 * carries its name, and the Inbox's count, in `aria-label`.
 */
export function DockStrip() {
  const stats = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });
  const count = stats.data ? inboxCount(stats.data.attention) : 0;

  return (
    <aside
      aria-label="Inbox and Today"
      className="hidden flex-col items-center xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:[[data-dock-folded]_&]:flex"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={
          count
            ? `Show Inbox and Today, ${count} ${count === 1 ? 'item' : 'items'}`
            : 'Show Inbox and Today'
        }
        title="Show Inbox and Today"
        id={UNFOLD}
        onClick={() => toggle(false, FOLD)}
        className="relative text-muted [&_svg:not([class*='size-'])]:size-[18px]"
      >
        <PanelRightOpen aria-hidden strokeWidth={1.75} />
        {/* The dock's own count pill, on the icon's corner; none at zero. */}
        {count ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-surface-active px-1 type-meta text-strong"
          >
            {count}
          </span>
        ) : null}
      </Button>
    </aside>
  );
}

/**
 * The open dock's button that folds it, at the top right, where the strip's
 * button that unfolds it sits.
 */
export function FoldButton() {
  return (
    <div className="hidden justify-end xl:flex">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Hide Inbox and Today"
        title="Hide Inbox and Today"
        id={FOLD}
        onClick={() => toggle(true, UNFOLD)}
        className="text-muted [&_svg:not([class*='size-'])]:size-[18px]"
      >
        <PanelRightClose aria-hidden strokeWidth={1.75} />
      </Button>
    </div>
  );
}

const FOLD = 'dock-fold';
const UNFOLD = 'dock-unfold';

/* Each button hides itself, so focus moves to the one that takes it back
   rather than falling to the page. */
function toggle(folded: boolean, next: string) {
  setDockFolded(folded);
  document.getElementById(next)?.focus();
}
