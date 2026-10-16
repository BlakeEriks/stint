import { localDateKey } from '@stint/core';

/**
 * A CSV attachment named for what it holds and the user's today, so a
 * second download a month later sits beside the first rather than over it.
 */
export function csvResponse(
  kind: 'entries' | 'invoices',
  tz: string,
  body: string,
) {
  const day = localDateKey(new Date(), tz);
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="stint-${kind}-${day}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
