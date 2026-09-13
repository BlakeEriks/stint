/**
 * `|Stint|` — the wordmark, matching the macOS lockup.
 *
 * The bounds are what carry the meaning the letters cannot: a stint is work
 * with a start and an end, which is also what the calendar draws and what an
 * invoice line is. The word sits inside them rather than beside them.
 *
 * **Not uppercase.** `type-wordmark` used to set `uppercase`, which rendered
 * STINT — four identical-height letterforms with no ascender or descender to
 * give the word a shape. Mixed case gives the `S` a cap to be taller than,
 * which is what lets the initial read as the initial when the mark contracts
 * to `|S|` on the menu bar. The role itself dropped the flag rather than every
 * call site overriding it: this component is its only consumer, and a role
 * fought with `normal-case` at every use is a role that is simply wrong.
 *
 * **One colour, bounds included.** The macOS lockup lifts its `S` — green,
 * with the rest at 55% — because on a menu bar the mark is alone and the
 * colour is carrying state. Here it is not: the accent already means the
 * running timer at the foot of the same frame, and a second green would be a
 * second meaning. Tried and rejected on sight.
 *
 * Two greys were tried after that, the `S` a step brighter than `tint`. At
 * 24px the difference read as a rendering fault rather than emphasis — the
 * word looked like it had loaded wrong. A wordmark is one object, so it takes
 * one value.
 *
 * `text-strong` is that value in the app, and receding it was tried first.
 * `text-subtle` measured **3.73:1 on the light header** — under AA, and this
 * is a LINK. It clears only the 3:1 large-text exemption, which is a
 * technicality to lean on for the one control that is on every screen. The
 * ramp's own note applies: `text-subtle` failing AA is a bug this palette
 * already fixed once.
 *
 * The colour is a prop rather than fixed, because the landing page's footer
 * deliberately recedes its mark while its header does not — one mark, two
 * placements. It is a whole utility (`text-muted`), not a shade parameter, so
 * the bounds keep tracking it through `currentColor`.
 */
export function Wordmark({
  className = 'text-strong',
}: {
  className?: string;
}) {
  return (
    <span className={`type-wordmark flex items-center ${className}`}>
      <Bound />
      <span>Stint</span>
      <Bound />
    </span>
  );
}

/**
 * A drawn rule, not a `|` glyph.
 *
 * The pipe character carries its own side bearings and sits on the text
 * baseline, so it rendered shorter than the cap height and too far from the
 * letters — the mark read as "l Stint l". A box matches the macOS bounds,
 * which are drawn for the same reason.
 */
function Bound() {
  return (
    <span
      aria-hidden
      className="mx-[0.18em] h-[1.05em] w-[0.09em] flex-none rounded-full bg-current"
    />
  );
}
