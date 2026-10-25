/**
 * What the server sends a phone when the running timer changes.
 *
 * The message says only that the timer changed: the phone asks the server
 * for it, so two pushes arriving out of order can't show the older state,
 * and nothing about the user's work passes through the provider. The
 * collapse key keeps only the last for a phone that is offline.
 */
export function fcmTimerMessage(token: string) {
  return {
    message: {
      token,
      data: { kind: 'timer' },
      android: { priority: 'HIGH', collapse_key: 'timer' },
    },
  };
}

/** What became of one send: `dead` deletes the token, `retry` tries once more. */
export type PushOutcome = 'sent' | 'dead' | 'retry' | 'failed';

interface FcmErrorBody {
  error?: { details?: Array<{ errorCode?: string }> };
}

/** FCM HTTP v1's answer to `messages:send`, from its status and parsed body. */
export function fcmOutcome(status: number, body: unknown): PushOutcome {
  if (status >= 200 && status < 300) return 'sent';
  const details = (body as FcmErrorBody | null)?.error?.details ?? [];
  if (details.some((d) => d.errorCode === 'UNREGISTERED')) return 'dead';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}
