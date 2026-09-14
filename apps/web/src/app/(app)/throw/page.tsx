/**
 * A screen that always throws, so `e2e/error-boundary.spec.ts` can drive the
 * error boundary. A 404 in production.
 */
import { notFound } from 'next/navigation';

export default function ThrowPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  throw new Error(
    'Deliberate: /throw exists to exercise the error boundary in development.',
  );
}
