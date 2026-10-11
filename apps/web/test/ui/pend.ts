import { vi } from 'vitest';

/** Stubs `fetch` to record each write and never answer, so what a test reads
    is the prediction alone, not a refetch that replaced it. */
export function pend() {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET')
        calls.push({
          method,
          path: String(url).replace('/api/v1', ''),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
      return new Promise<Response>(() => {});
    }),
  );
  return calls;
}
