import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARK_IDS_MAX } from '@stint/schema';
import { api } from '@/lib/client/api';

afterEach(() => vi.unstubAllGlobals());

const ids = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `018f0000-0000-7000-8000-${String(i).padStart(12, '0')}`,
  );

describe('Marking more entries billed elsewhere than one request takes', () => {
  it('sends them in requests of at most the cap, in order', async () => {
    const sent: string[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        sent.push(body.ids);
        return Response.json({ ids: body.ids });
      }),
    );
    const all = ids(MARK_IDS_MAX * 2 + 500);
    const res = await api.markAllInvoicedElsewhere(all);
    expect(sent.map((s) => s.length)).toEqual([
      MARK_IDS_MAX,
      MARK_IDS_MAX,
      500,
    ]);
    expect(sent.flat()).toEqual(all);
    expect(res.ids).toEqual(all);
  });

  it('fails the whole press when one request fails, sending no more', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls += 1;
        if (calls === 2)
          return Response.json(
            { code: 'INTERNAL', message: 'Down.' },
            { status: 500 },
          );
        return Response.json({ ids: JSON.parse(init.body as string).ids });
      }),
    );
    await expect(
      api.markAllInvoicedElsewhere(ids(MARK_IDS_MAX * 2 + 1)),
    ).rejects.toThrow();
    expect(calls).toBe(2);
  });
});
