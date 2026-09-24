/**
 * UUIDv7 — time-ordered, so entries sort naturally by creation without a
 * separate sequence. Client-generated, which is what makes a retried insert
 * idempotent: the same id lands on the same row, and the API translates the
 * duplicate-key violation into the existing row rather than an error.
 */

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function uuidv7(now: number = Date.now()): string {
  return format(randomBytes(16), now);
}

/**
 * A UUIDv7 whose random bits are a SHA-256 of `key`, so the same key always
 * yields the same id. An import derives each row's id this way, which makes
 * re-importing a file land on the rows it already wrote.
 */
export async function deterministicUuidv7(
  key: string,
  now: number,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(key),
  );
  return format(new Uint8Array(digest).slice(0, 16), now);
}

function format(bytes: Uint8Array, now: number): string {
  // 48-bit big-endian timestamp (ms since epoch)
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
