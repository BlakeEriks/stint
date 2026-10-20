/**
 * What a region shows while its data is on the way: one quiet word where the
 * content will be (`specs/007-paint-once/design/loader.html`).
 *
 * Its timing is all CSS (`.loader`, `globals.css`): blank for the first
 * 600ms, so a load that finishes sooner never shows it, then a fade in, then
 * a slow breath so a long wait still reads as alive. No timer state, so a
 * remount never flashes it.
 *
 * In the content panel it centers on the whole card (`globals.css`): the
 * screen it stands in for fills the card, so the word sits where its middle
 * will be. `tight` stays in the flow, under the heading it belongs to.
 */
export function Loader({ tight = false }: { tight?: boolean }) {
  return (
    <p
      role="status"
      data-tight={tight || undefined}
      className={`loader px-4 text-center type-label text-subtle ${
        tight ? 'py-8' : 'py-10'
      }`}
    >
      Loading
    </p>
  );
}
