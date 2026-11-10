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
        size="xs"
        aria-label={
          count
            ? `Show Inbox and Today, ${count} ${count === 1 ? 'item' : 'items'}`
            : 'Show Inbox and Today'
        }
        title="Show Inbox and Today"
        id={UNFOLD}
        onClick={() => toggle(false, FOLD)}
        className={`relative ${FOLD_BUTTON}`}
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
 * The open dock's button that folds it, at the end of the Inbox's header,
 * where the strip's button that unfolds it sits once folded. In the header
 * rather than a row of its own: a row holding one icon is empty ground that
 * pushes the Inbox below the top of the content beside it.
 */
export function FoldButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label="Hide Inbox and Today"
      title="Hide Inbox and Today"
      id={FOLD}
      onClick={() => toggle(true, UNFOLD)}
      className={`hidden xl:inline-flex ${FOLD_BUTTON}`}
    >
      <PanelRightClose aria-hidden strokeWidth={1.75} />
    </Button>
  );
}

/* 24px square, the Inbox header's height with its count pill in it, so the
   button adds no height to the row; `xs` for the dock's density, with the
   icon at the header's own 16px. */
const FOLD_BUTTON =
  "size-6 p-0 text-muted has-[>svg]:px-0 [&_svg:not([class*='size-'])]:size-4";

const FOLD = 'dock-fold';
const UNFOLD = 'dock-unfold';

/* Each button hides itself, so focus moves to the one that takes it back
   rather than falling to the page. */
function toggle(folded: boolean, next: string) {
  setDockFolded(folded);
  document.getElementById(next)?.focus();
}
