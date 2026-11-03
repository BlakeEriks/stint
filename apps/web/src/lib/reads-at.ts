/**
 * The instant a read is cut at: the client's `x-stint-now`, which the web
 * sends when a tester has chosen another day (`lib/client/today.ts`), or the
 * real clock. Production never honors it, and nothing that writes or
 * measures a timer reads it: the server's timer truth stays real.
 */
export function readsAt(req: Request): Date {
  const asked = req.headers.get('x-stint-now');
  if (!asked || process.env.VERCEL_ENV === 'production') return new Date();
  const at = new Date(asked);
  return Number.isNaN(at.getTime()) ? new Date() : at;
}
