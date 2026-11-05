/**
 * The instant a read is cut at: the client's `x-stint-now`, which the web
 * sends when a tester has chosen another day (`lib/client/today.ts`), or the
 * real clock. Only a preview or local dev honors it. A running timer in
 * `/stats` is measured at that instant. A write reads it only for the reads
 * it includes, never for what it records.
 */
export function readsAt(req: Request): Date {
  const asked = req.headers.get('x-stint-now');
  const env = process.env.VERCEL_ENV;
  if (!asked || (env !== undefined && env !== 'preview')) return new Date();
  const at = new Date(asked);
  return Number.isNaN(at.getTime()) ? new Date() : at;
}
