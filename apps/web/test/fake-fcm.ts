/**
 * FCM HTTP v1 and Google's token endpoint, in memory. Set as `__TEST_FCM__`
 * in place of `fetch`, the way `__TEST_STRIPE__` stands in for Stripe, so no
 * test reaches Google. The token endpoint checks the assertion's signature
 * against the service account's key, so a wrongly signed JWT fails here as
 * it would there.
 */
import { createVerify, generateKeyPairSync } from 'node:crypto';

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

let accounts = 0;

/** A fresh service account each call: the access token is cached by account. */
export function serviceAccount() {
  accounts += 1;
  return JSON.stringify({
    project_id: 'stint-test',
    client_email: `push-${accounts}@stint-test.iam.gserviceaccount.com`,
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: TOKEN_URI,
  });
}

/** FCM's answer for an unregistered token. */
export const UNREGISTERED = {
  status: 404,
  body: {
    error: {
      code: 404,
      status: 'NOT_FOUND',
      details: [
        {
          '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
          errorCode: 'UNREGISTERED',
        },
      ],
    },
  },
};

export function fakeFcm() {
  const state = {
    /** Each send's message, in order. */
    sent: [] as Array<{ token: string; data: unknown; android: unknown }>,
    tokenRequests: 0,
    /** The next sends' answers, first first; then 200. */
    answers: [] as Array<{ status: number; body?: unknown }>,
  };

  const fetch = async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (href === TOKEN_URI) {
      state.tokenRequests += 1;
      const assertion = new URLSearchParams(String(init?.body)).get(
        'assertion',
      );
      const [header, claims, signature] = (assertion ?? '').split('.');
      const valid = createVerify('RSA-SHA256')
        .update(`${header}.${claims}`)
        .verify(publicKey, signature ?? '', 'base64url');
      if (!valid)
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: 'ya29.test', expires_in: 3600 });
    }
    if (
      href === 'https://fcm.googleapis.com/v1/projects/stint-test/messages:send'
    ) {
      const auth = new Headers(init?.headers).get('authorization');
      if (auth !== 'Bearer ya29.test') {
        return Response.json({ error: { code: 401 } }, { status: 401 });
      }
      state.sent.push(JSON.parse(String(init?.body)).message);
      const answer = state.answers.shift() ?? {
        status: 200,
        body: { name: 'projects/stint-test/messages/1' },
      };
      return Response.json(answer.body ?? {}, { status: answer.status });
    }
    throw new Error(`fake-fcm: unexpected request to ${href}`);
  };

  return { state, fetch };
}
