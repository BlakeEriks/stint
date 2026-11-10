import { NextResponse } from 'next/server';
import { RequestCode } from '@stint/schema';
import { ApiError, handle } from '@/lib/errors';
import { parseBody } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/code. **No auth**: the macOS and phone apps ask here for
 * a sign-in code. Production's CAPTCHA guards GoTrue's `/otp`, and a native
 * app has no CAPTCHA to solve, so this asks with the secret key, which
 * GoTrue lets past it. `create_user: false` keeps it from making accounts:
 * it mails only an address that already has one, as `/otp` always would.
 */
export const POST = handle(async (req: Request) => {
  const { email } = await parseBody(req, RequestCode);
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret)
    throw new Error('Missing environment variable: SUPABASE_SECRET_KEY');

  const res = await fetch(
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
  // GoTrue's "no such account" names a server setting, not the fact.
  if (body.error_code === 'otp_disabled')
    throw new ApiError(
      'NO_ACCOUNT',
      'No Stint account uses this email. Sign up at app.runstint.com, then sign in here.',
    );
  if (res.status === 429)
    throw new ApiError(
      'RATE_LIMITED',
      body.msg ?? 'Wait a minute, then ask for a new code.',
    );
  throw new Error(
    `GoTrue /otp answered ${res.status}: ${JSON.stringify(body)}`,
  );
});
