import { readBody, readFailure } from '@stint/client';

export type Request = <T>(
  method: string,
  path: string,
  body?: unknown,
) => Promise<T>;

interface Options {
  /** The web app's origin; empty in the web render, which Metro proxies. */
  origin: string;
  auth: {
    accessToken: () => Promise<string>;
    refresh: () => Promise<{ accessToken: string }>;
    signOut: () => Promise<void>;
  };
  bypass: string | null;
  fetch?: typeof fetch;
}

/**
 * `/api/v1` as a bearer-token client, the path `requireSession` takes for
 * every client but the web's cookie.
 *
 * A 401 is answered by one refresh and one retry: the access token can die
 * between the expiry check and the server reading it. A second 401 means
 * the server no longer knows the session, so it signs out.
 */
export function createRequest({
  origin,
  auth,
  bypass,
  fetch: send = fetch,
}: Options): Request {
  const call = (method: string, path: string, body: unknown, token: string) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (bypass) headers['x-vercel-protection-bypass'] = bypass;
    return send(`${origin}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  return async <T>(method: string, path: string, body?: unknown) => {
    let res = await call(method, path, body, await auth.accessToken());
    if (res.status === 401) {
      const { accessToken } = await auth.refresh();
      res = await call(method, path, body, accessToken);
      if (res.status === 401) await auth.signOut();
    }
    if (!res.ok) throw await readFailure(res);
    return readBody<T>(res);
  };
}
