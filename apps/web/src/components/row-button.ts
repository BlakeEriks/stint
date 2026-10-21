/**
 * A pressable row (`.claude/rules/web-ui.md`): its highlight pads the content
 * and is rounded, so it never hugs the text. Layout, gap and height stay with
 * the row.
 */
export const rowButton =
  'group rounded-md px-2 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none';

/**
 * Pulls the row out by its own padding, so its text keeps the column's edge
 * and only the highlight reaches past it.
 */
export const rowBleed = '-mx-2 w-[calc(100%+1rem)]';

/**
 * A control hidden until its `group` row is hovered or the control is
 * focused, so a column of them does not compete with the row's content.
 * Always shown where there is no hover, or a touch screen could never reach it.
 */
export const revealOnRowHover =
  'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';
