/**
 * The marketing shell, for a page that is static and signed-out.
 *
 * A nested layout under the single root, so moving between here and the app
 * is a client navigation rather than the full reload separate root layouts
 * would force.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-surface-base">{children}</div>;
}
