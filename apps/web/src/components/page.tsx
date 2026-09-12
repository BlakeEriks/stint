/**
 * The content column.
 *
 * Every screen had its own copy of `mx-auto max-w-3xl px-4 py-8 sm:px-6
 * sm:py-10`, which is how the calendar ended up silently different (`max-w-5xl`)
 * and how a padding change would have meant editing seven files.
 *
 * `wide` is for screens that are a grid rather than a column — the calendar's
 * seven days need the room, and capping them at prose width wastes the space
 * the rail was meant to free up.
 */
export function Page({
  wide = false,
  children,
}: {
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      className={`mx-auto px-4 py-8 sm:px-8 sm:py-10 ${
        wide ? 'max-w-6xl' : 'max-w-3xl'
      }`}
    >
      {children}
    </main>
  );
}
