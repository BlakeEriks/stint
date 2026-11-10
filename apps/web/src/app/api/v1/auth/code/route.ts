import { NextResponse } from 'next/server';
import { RequestCode } from '@stint/schema';
import { ApiError, handle } from '@/lib/errors';
import { serviceClient } from '@/lib/supabase';
import { parseBody } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/** The route tests answer GoTrue in memory. */
const gotrue = () =>
  (globalThis as { __TEST_GOTRUE__?: typeof fetch }).__TEST_GOTRUE__ ?? fetch;

/**
 * POST /api/v1/auth/code. **No auth**: the macOS and phone apps ask here for
 * a sign-in code. Production's CAPTCHA guards GoTrue's `/otp`, and a native
 * app has no CAPTCHA to solve, so this asks with the secret key, which
 * GoTrue lets past it. `create_user: false` keeps it from making accounts.
 *
 * Past the CAPTCHA, two things stand in for it: five codes an hour per
 * client address (`take_sign_in_code_slot`), and one answer for every
 * address, so nobody can learn which have an account.
 */
export const POST = handle(async (req: Request) => {
  const { email } = await parseBody(req, RequestCode);
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret)
    throw new Error('Missing environment variable: SUPABASE_SECRET_KEY');

  // Vercel sets `x-real-ip` to the caller's address, overwriting any sent.
  const { data, error } = await serviceClient().rpc('take_sign_in_code_slot', {
    p_ip: req.headers.get('x-real-ip') ?? '',
  });
  if (error) throw error;
  if (!data?.[0]?.allowed)
    throw new ApiError(
      'RATE_LIMITED',
      'Too many sign-in codes from here. Try again in an hour.',
    );

  const res = await gotrue()(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`,
    {
      method: 'POST',
      headers: {
        apikey: secret,
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, create_user: false }),
    },
  );
  if (res.ok) return NextResponse.json({});
  const body = (await res.json().catch(() => ({}))) as {
    error_code?: string;
    msg?: string;
  };
  if (body.error_code === 'otp_disabled') return NextResponse.json({});
  /* GoTrue's per-address interval reaches only an address with an account,
     so it answers as a sent code does: the last one still works. Its other
     429, the project's email quota, is an outage. */
  if (res.status === 429 && body.msg?.startsWith('For security purposes'))
    return NextResponse.json({});
  throw new Error(
    `GoTrue /otp answered ${res.status}: ${JSON.stringify(body)}`,
  );
});
