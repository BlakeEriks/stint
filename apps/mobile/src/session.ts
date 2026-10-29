import { ApiError } from '@stint/client';
import { createListeners } from './listeners.ts';

/**
 * Sign-in by emailed six-digit code, verified against GoTrue over `fetch`,
 * as the macOS app does (`docs/macos.md`, Sign-in): two POSTs need no SDK.
 *
 * **Only GoTrue rejecting the refresh token signs out.** Offline, a timeout,
 * a 5xx or a rate limit keeps the session and fails the one request, so a
 * phone that spent the night in airplane mode is still signed in.
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
  email: string;
  /** Absent from a session an earlier build stored, until its next refresh. */
  userId?: string;
}

/** Secure storage on a phone (`storage.ts`), a Map in tests. */
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Options {
  supabaseUrl: string;
  supabaseKey: string;
  store: Store;
  fetch?: typeof fetch;
  now?: () => number;
}

/** What GoTrue answers a sign-in or a refresh with. */
interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}

/** Refresh this long before the access token dies. */
const HEADROOM_S = 60;

const signedOut = () =>
  new ApiError(401, { code: 'UNAUTHORIZED', message: 'Signed out.' });

export function createAuth({
  supabaseUrl,
  supabaseKey,
  store,
  fetch: send = fetch,
  now = Date.now,
}: Options) {
  /* Per backend host, so local, preview and production sessions never
     overwrite each other. */
  const key = `stint.session.${new URL(supabaseUrl).host.replace(/[^\w.-]/g, '_')}`;
  const listeners = createListeners<Session | null>();
  let cached: Session | null | undefined;
  // One in-flight refresh, shared: two callers racing would each spend a
  // rotating refresh token and one would lose.
  let refreshing: Promise<Session> | null = null;

  async function load(): Promise<Session | null> {
    if (cached === undefined) {
      const raw = await store.get(key);
      cached = raw ? (JSON.parse(raw) as Session) : null;
    }
    return cached;
  }

  async function save(session: Session | null) {
    cached = session;
    if (session) await store.set(key, JSON.stringify(session));
    else await store.delete(key);
    listeners.emit(session);
  }

  async function post(path: string, body: unknown) {
    const res = await send(`${supabaseUrl}/auth/v1${path}`, {
      method: 'POST',
      headers: { apikey: supabaseKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  }

  async function signInWithSession(s: GoTrueSession) {
    await save({
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      expiresAt: s.expires_at,
      email: s.user.email ?? '',
      userId: s.user.id,
    });
  }

  async function refresh(): Promise<Session> {
    refreshing ??= (async () => {
      const current = await load();
      if (!current) throw signedOut();
      const { status, body } = await post('/token?grant_type=refresh_token', {
        refresh_token: current.refreshToken,
      });
      if (status === 200) {
        await signInWithSession(body as GoTrueSession);
        return (await load()) as Session;
      }
      // A spent, revoked or unknown refresh token is a 4xx; 408 and 429 are
      // the network's and the rate limit's, and say nothing about it.
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        await save(null);
        throw signedOut();
      }
      throw failure(status, body, 'Could not reach Stint.');
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  return {
    load,
    refresh,
    signInWithSession,

    /** `create_user: false`: this app signs existing accounts in. */
    async sendCode(email: string) {
      const { status, body } = await post('/otp', {
        email,
        create_user: false,
      });
      if (status === 200) return;
      // GoTrue's "no such account" names a server setting, not the fact.
      if (body.error_code === 'otp_disabled')
        throw new ApiError(status, {
          code: 'NO_ACCOUNT',
          message:
            'Stint is invite-only during alpha. Request an invite at runstint.com.',
        });
      throw failure(status, body, 'Could not send the sign-in email.');
    },

    /** `type: "email"`: `"magiclink"` is the link's hashed token and rejects a typed code. */
    async verifyCode(email: string, code: string) {
      const token = code.replace(/\D/g, '');
      if (token.length !== 6)
        throw new ApiError(400, {
          code: 'INVALID_CODE',
          message: 'A sign-in code is six digits.',
        });
      const { status, body } = await post('/verify', {
        type: 'email',
        email,
        token,
      });
      if (status !== 200)
        throw failure(
          status,
          body,
          'That code did not work. Codes expire quickly and can only be used once.',
        );
      await signInWithSession(body as GoTrueSession);
    },

    async signInWithPassword(email: string, password: string) {
      const { status, body } = await post('/token?grant_type=password', {
        email,
        password,
      });
      if (status !== 200)
        throw failure(status, body, `Could not sign in as ${email}.`);
      await signInWithSession(body as GoTrueSession);
    },

    /** A token good for the next request, refreshed with headroom. */
    async accessToken(): Promise<string> {
      const session = await load();
      if (!session) throw signedOut();
      if (session.expiresAt - now() / 1000 > HEADROOM_S)
        return session.accessToken;
      return (await refresh()).accessToken;
    },

    async signOut() {
      await save(null);
    },

    /** Called with the session on every sign-in, refresh and sign-out. */
    subscribe: listeners.subscribe,
  };
}

export type Auth = ReturnType<typeof createAuth>;

function failure(
  status: number,
  body: { msg?: string; error_description?: string; error_code?: string },
  fallback: string,
) {
  return new ApiError(status, {
    code: body.error_code ?? 'UNKNOWN',
    message: body.msg ?? body.error_description ?? fallback,
  });
}
