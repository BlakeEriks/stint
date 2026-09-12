/**
 * The marketing shell: no nav rail, no Query provider, no timer context.
 *
 * The landing page is static and signed-out — none of the app's plumbing
 * applies to it, and the rail in particular would contradict the page's own
 * argument by putting five sections of chrome around a pitch for restraint.
 *
 * It is a nested layout under the single root, so moving between here and
 * `/app` is a client navigation rather than the full reload that separate
 * root layouts would force.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-surface-base">{children}</div>;
}
