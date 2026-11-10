import { createSign } from 'node:crypto';
import { fcmOutcome, fcmTimerMessage } from '@stint/core';
import type { PushProvider } from './push';

/** The fields of a Firebase service account's JSON key this reads. */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/**
 * Android's provider: FCM HTTP v1, signed in as the service account in
 * `FCM_SERVICE_ACCOUNT` (`docs/deploying.md`). Null while it is unset, so a
 * deploy without Firebase sends nothing.
 */
export function fcm(): PushProvider | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  const account = JSON.parse(raw) as ServiceAccount;
  return {
    async send(token) {
      const res = await transport()(
        `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await accessToken(account)}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(fcmTimerMessage(token)),
        },
      );
      const text = await res.text();
      const body = parse(text);
      return { outcome: fcmOutcome(res.status, body), detail: text };
    },
  };
}

/** The route tests answer FCM and Google's token endpoint in memory
 *  (`test/fake-fcm.ts`), as `__TEST_STRIPE__` answers for Stripe. */
function transport(): typeof fetch {
  return (globalThis as { __TEST_FCM__?: typeof fetch }).__TEST_FCM__ ?? fetch;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

/* One access token per service account, reused until a minute before it
   expires: Google allows an hour, and every push would otherwise cost a
   second request. */
const tokens = new Map<string, { value: string; expiresAt: number }>();

async function accessToken(account: ServiceAccount): Promise<string> {
  const cached = tokens.get(account.client_email);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const res = await transport()(account.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion(account),
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Google refused the FCM service account: ${res.status} ${await res.text()}`,
    );
  }
  const { access_token, expires_in } = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokens.set(account.client_email, {
    value: access_token,
    expiresAt: Date.now() + (expires_in - 60) * 1000,
  });
  return access_token;
}

/** The signed JWT Google trades for an access token (RFC 7523). */
function assertion(account: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: account.client_email,
    scope: SCOPE,
    aud: account.token_uri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(account.private_key, 'base64url');
  return `${unsigned}.${signature}`;
}
