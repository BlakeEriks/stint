/**
 * What the suites against a real Auth server share: its address and keys,
 * which `pnpm test:auth` reads from `supabase status`, and its admin API.
 */
const env = (name: string) => {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is unset: this suite needs a running Auth server. Run \`pnpm test:auth\`.`,
    );
  return value;
};

export const url = env('SUPABASE_URL');
export const publishable = env('SUPABASE_PUBLISHABLE_KEY');
export const secret = env('SUPABASE_SECRET_KEY');

// The app builds its clients from these at call time.
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishable;
process.env.SUPABASE_SECRET_KEY = secret;

export const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: secret,
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

export const usersNamed = async (email: string): Promise<{ id: string }[]> =>
  (
    await admin(`/admin/users?filter=${encodeURIComponent(email)}`).then((r) =>
      r.json(),
    )
  ).users ?? [];

export const deleteUser = (id: string) =>
  admin(`/admin/users/${id}`, { method: 'DELETE' });

/** Creates a confirmed user, first deleting any an interrupted run left. */
export const freshUser = async (
  email: string,
  fields: Record<string, unknown> = {},
): Promise<string> => {
  for (const u of await usersNamed(email)) await deleteUser(u.id);
  const created = await admin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, email_confirm: true, ...fields }),
  }).then((r) => r.json());
  if (!created.id)
    throw new Error(`could not create ${email}: ${JSON.stringify(created)}`);
  return created.id;
};
