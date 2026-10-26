/**
 * A pressable row (`.claude/rules/web-ui.md`): its highlight pads the content
 * and is rounded, so it never hugs the text. Layout, gap and height stay with
 * the row. `relative` holds the row's `sr-only` text inside it: positioned
 * against the panel instead, it overflows the scroller it sits in.
 */
export const rowButton =
  'group relative rounded-md px-2 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none';

/**
 * Pulls the row out by its own padding, so its text keeps the column's edge
 * and only the highlight reaches past it.
 */
export const rowBleed = '-mx-2 w-[calc(100%+1rem)]';
