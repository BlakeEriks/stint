import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDownload } from '@/lib/client/use-download';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const csv = (name: string) =>
  new Response('﻿A\r\n', {
    headers: { 'content-disposition': `attachment; filename="${name}"` },
  });

/** Every link the hook clicks, with the name it saves under. */
function captureSaves() {
  const saved: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  return saved;
}

describe('useDownload', () => {
  it('is pending while the server prepares the file, then saves it under its name', async () => {
    const saved = captureSaves();
    let answer = (_: Response) => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => (answer = r))),
    );
    const { result } = renderHook(() => useDownload('invoices'));

    act(() => void result.current.download());
    expect(result.current.pending).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/v1\/exports\/invoices\?tz=/),
    );

    await act(async () => answer(csv('stint-invoices-2026-10-12.csv')));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(saved).toEqual(['stint-invoices-2026-10-12.csv']);
    expect(result.current.failed).toBe(false);
  });

  it('a server error fails the download without saving the error as the file', async () => {
    const saved = captureSaves();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useDownload('entries'));
    await act(() => result.current.download());
    expect(result.current).toMatchObject({ pending: false, failed: true });
    expect(saved).toEqual([]);
  });

  it('a network failure fails the download, and the next press clears it', async () => {
    captureSaves();
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useDownload('entries'));
    await act(() => result.current.download());
    expect(result.current.failed).toBe(true);

    let answer = (_: Response) => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((r) => (answer = r)) as never,
    );
    act(() => void result.current.download());
    expect(result.current).toMatchObject({ pending: true, failed: false });
    await act(async () => answer(csv('stint-entries-2026-10-12.csv')));
  });

  it('an unexpected error is not swallowed', async () => {
    captureSaves();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new RangeError('a bug');
      }),
    );
    const { result } = renderHook(() => useDownload('entries'));
    await act(() => expect(result.current.download()).rejects.toThrow('a bug'));
    expect(result.current).toMatchObject({ pending: false, failed: false });
  });
});
