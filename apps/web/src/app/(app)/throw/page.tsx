/**
 * A screen that always throws, so the error boundary can be tested.
 *
 * **It does not exist outside development.** `notFound()` in production makes
 * `/throw` a 404 there, so this cannot be reached by a user or a crawler even
 * though the file ships in the bundle.
 *
 * It exists because nothing else in the app can be made to fail from the
 * outside. Every real failure is handled: a missing invoice renders "Not
 * found.", a failed fetch renders its own message, a 401 redirects to
 * `/signin`. That is the app being correct, and it leaves the boundary — the
 * code that runs when everything else has failed — with no way to be
 * exercised except by editing a component and reloading, which is not a test.
 *
 * `e2e/error-boundary.spec.ts` drives this to prove the thing that matters and
 * cannot be checked in jsdom: that a thrown error replaces the CONTENT COLUMN
 * while the frame — and the running timer inside it — keeps rendering.
 */
import { notFound } from 'next/navigation';

export default function ThrowPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  throw new Error(
    'Deliberate: /throw exists to exercise the error boundary in development.',
  );
}
