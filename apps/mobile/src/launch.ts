import { ApiError } from '@stint/client';
import type { Auth, Session } from './session.ts';

interface Options {
  auth: Pick<Auth, 'load' | 'subscribe' | 'signInWithPassword'>;
  /** A preview build's seeded account (`target.ts`), or null. */
  preview: { email: string; password: string } | null;
  /** The session to show: the timer, or sign-in when null. */
  show: (session: Session | null) => void;
  /** Forgets every cached read. */
  clear: () => void;
  /** Names the user crash reports belong to (`crash-reporting.ts`). */
  identify: (userId: string | null) => void;
}

/**
 * What the app shows at launch, and after every sign-in and sign-out.
 * Nothing of one account outlives its sign-out, so the cache is cleared
 * then. Returns the unsubscribe.
 */
export function startSession({
  auth,
  preview,
  show: render,
  clear,
  identify,
}: Options) {
  const show = (session: Session | null) => {
    identify(session?.userId ?? null);
    render(session);
  };
  const off = auth.subscribe((next) => {
    if (!next) clear();
    show(next);
  });
  void (async () => {
    const stored = await auth.load();
    // A preview build signs in as its PR's seeded account; the listener shows it.
    if (!stored && preview)
      await auth.signInWithPassword(preview.email, preview.password);
    else show(stored);
  })().catch((e) => {
    // A preview account the PR hasn't seeded yet, or no network: sign-in.
    if (!(e instanceof ApiError || e instanceof TypeError)) throw e;
    show(null);
  });
  return off;
}
