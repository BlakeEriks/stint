import type { Metadata } from 'next';

/**
 * Shared shell for the legal pages.
 *
 * They live beside the landing page rather than in the app: they are public,
 * signed-out, static documents, and a visitor reaches them from the marketing
 * footer. Prose measure is narrower than the marketing column — these are
 * read, not scanned.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:px-10 sm:py-24">
      <a href="/" className="type-nav text-subtle hover:text-muted">
        Stint
      </a>
      <h1 className="type-display mt-8 text-strong">{title}</h1>
      <p className="type-meta mt-2 text-subtle">Last updated {updated}</p>
      <div className="mt-10 flex flex-col gap-8">{children}</div>
    </main>
  );
}

export function Clause({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="type-heading text-strong">{heading}</h2>
      <div className="type-body mt-2 flex flex-col gap-3 text-muted">
        {children}
      </div>
    </section>
  );
}

export const legalMetadata = (title: string): Metadata => ({
  title: `${title} · Stint`,
  robots: { index: true, follow: true },
});
