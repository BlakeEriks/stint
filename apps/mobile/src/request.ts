import { ApiError, readBody, readFailure } from '@stint/client';

export type Request = <T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { signed?: boolean },
) => Promise<T>;

interface Options {
  /** The web app's origin; empty in the web render, which Metro proxies. */
  origin: string;
  auth: {
    accessToken: () => Promise<string>;
    refresh: () => Promise<{ accessToken: string }>;
    signOut: () => Promise<void>;
  };
  /** Vercel's protection bypass, on a preview build once it is typed in (`bypass.ts`). */
  bypass: () => string | null;
  /** Vercel refused the request before it reached Stint. */
  onProtected?: () => void;
  fetch?: typeof fetch;
}

/**
 * `/api/v1` as a bearer-token client, the path `requireSession` takes for
 * every client but the web's cookie.
 *
 * A 401 is answered by one refresh and one retry: the access token can die
 * between the expiry check and the server reading it. A second 401 means
 * the server no longer knows the session, so it signs out.
 *
 * Vercel's deployment protection answers 401 too, with its own page rather
 * than our JSON `code`: that is a missing or rotated bypass, which no
 * refresh mends, so it goes to `onProtected` instead.
 *
 * `{ signed: false }` sends no token, for the one route asked signed out.
 */
export function createRequest({
  origin,
  auth,
  bypass,
  onProtected,
  fetch: send = fetch,
}: Options): Request {
  const call = (
    method: string,
    path: string,
    body: unknown,
    token: string | null,
  ) => {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const pass = bypass();
    if (pass) headers['x-vercel-protection-bypass'] = pass;
    return send(`${origin}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  return async <T>(
    method: string,
    path: string,
    body?: unknown,
    { signed = true }: { signed?: boolean } = {},
  ) => {
    let res = await call(
      method,
      path,
      body,
      signed ? await auth.accessToken() : null,
    );
    if (await isVercels401(res)) {
      onProtected?.();
      throw new ApiError(401, {
        code: 'VERCEL_PROTECTED',
        message: 'This preview needs its Vercel bypass.',
      });
    }
    if (signed && res.status === 401) {
      const { accessToken } = await auth.refresh();
      res = await call(method, path, body, accessToken);
      if (res.status === 401) await auth.signOut();
    }
    if (!res.ok) throw await readFailure(res);
    return readBody<T>(res);
  };
}

/** A 401 whose body is not the API's error: Vercel's protection page. */
async function isVercels401(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const text = await res.clone().text();
  try {
    return typeof JSON.parse(text)?.code !== 'string';
  } catch (parse) {
    if (!(parse instanceof SyntaxError)) throw parse;
    return true;
  }
}
