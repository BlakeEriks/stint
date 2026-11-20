import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { uuidv7 } from '@stint/core';
import {
  CreateBusinessProfile,
  CreatePaymentProfile,
  ListProfilesQuery,
  UpdateBusinessProfile,
  UpdatePaymentProfile,
} from '@stint/schema';
import { ApiError, handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import {
  BUSINESS_PROFILE_COLUMNS,
  BUSINESS_PROFILE_FIELDS,
  PAYMENT_PROFILE_COLUMNS,
  PAYMENT_PROFILE_FIELDS,
  toColumns,
  toBusinessProfile,
  toPaymentProfile,
  type BusinessProfileRow,
  type PaymentProfileRow,
} from '@/lib/rows';

/**
 * A named set of invoice details the user keeps several of, one of them the
 * default: payment details, and the businesses an invoice is from. Each kind's routes are these handlers
 * over its own table, so the default rules are one implementation.
 */
export interface ProfileKind<P> {
  table: string;
  columns: string;
  toProfile: (row: never) => P;
  fields: Record<string, string>;
  create: z.ZodType<{ id?: string; isDefault: boolean }>;
  update: z.ZodType<{ isDefault?: boolean; archived?: boolean }>;
  /** The list's key in `GET`'s answer. */
  listKey: string;
  /** What a 404 says. */
  notFound: string;
}

export const PAYMENT_PROFILES: ProfileKind<
  ReturnType<typeof toPaymentProfile>
> = {
  table: 'payment_profiles',
  columns: PAYMENT_PROFILE_COLUMNS,
  toProfile: (r: PaymentProfileRow) => toPaymentProfile(r),
  fields: PAYMENT_PROFILE_FIELDS,
  create: CreatePaymentProfile,
  update: UpdatePaymentProfile,
  listKey: 'paymentProfiles',
  notFound: 'Payment profile not found',
};

export const BUSINESS_PROFILES: ProfileKind<
  ReturnType<typeof toBusinessProfile>
> = {
  table: 'business_profiles',
  columns: BUSINESS_PROFILE_COLUMNS,
  toProfile: (r: BusinessProfileRow) => toBusinessProfile(r),
  fields: BUSINESS_PROFILE_FIELDS,
  create: CreateBusinessProfile,
  update: UpdateBusinessProfile,
  listKey: 'businessProfiles',
  notFound: 'Business not found',
};

type Ctx = { params: Promise<{ id: string }> };

/** `GET` and `POST` on the kind's collection. */
export function profileCollection<P>(kind: ProfileKind<P>) {
  const GET = handle(async (req: Request) => {
    const { db } = await requireSession(req);
    const q = parseQuery(req, ListProfilesQuery);

    let query = db
      .from(kind.table)
      .select(kind.columns)
      .order('is_default', { ascending: false })
      .order('name');

    if (!q.includeArchived) query = query.is('archived_at', null);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      [kind.listKey]: (data ?? []).map((r) => kind.toProfile(r as never)),
    });
  });

  const POST = handle(async (req: Request) => {
    const { userId, db } = await requireSession(req);
    const body = await parseBody(req, kind.create);

    const { data: existing, error: countError } = await db
      .from(kind.table)
      .select('id')
      .is('archived_at', null);
    if (countError) throw countError;

    // The first profile is the default regardless — otherwise a user who
    // never ticks the box gets invoices with nothing from it.
    const isDefault = body.isDefault || (existing ?? []).length === 0;

    // A partial unique index enforces one default; clear the old one first.
    if (isDefault) await clearDefault(db, kind);

    const { data, error } = await db
      .from(kind.table)
      .insert({
        ...toColumns(body, kind.fields, { nullMissing: true }),
        id: body.id ?? uuidv7(),
        user_id: userId,
        is_default: isDefault,
      })
      .select(kind.columns)
      .single();

    if (error)
      return NextResponse.json(await replayed(db, kind, error, body.id));
    return NextResponse.json(kind.toProfile(data as never), { status: 201 });
  });

  return { GET, POST };
}

/** `GET`, `PATCH` and `DELETE` on one of the kind's rows. */
export function profileItem<P>(kind: ProfileKind<P>) {
  const GET = handle(async (req: Request, ctx: Ctx) => {
    const { db } = await requireSession(req);
    const { id } = await ctx.params;
    return NextResponse.json(await mustRead(db, kind, id));
  });

  /* Editing a profile never touches an already-issued invoice: those carry
     a frozen copy. Only future invoices see the change. */
  const PATCH = handle(async (req: Request, ctx: Ctx) => {
    const { db } = await requireSession(req);
    const { id } = await ctx.params;
    const patch = await parseBody(req, kind.update);

    const update = patchColumns(patch, kind);

    // One default per user is a partial unique index; clear the old one
    // first so the update does not collide with it.
    if (patch.isDefault === true) await clearDefault(db, kind, id);

    /* Demoting the only profile would leave the user with no default, and
       the next invoice resolves to nothing with nothing saying why. The
       index stops two defaults; this stops zero, which creation already
       guarantees. */
    if (patch.isDefault === false && (await isOnlyLive(db, kind, id))) {
      delete update.is_default;
      // `is_default: false` may have been the only field, and an update with
      // no columns is not a request to reject — it is one already satisfied.
      if (Object.keys(update).length === 0)
        return NextResponse.json(await mustRead(db, kind, id));
    }

    const { data, error } = await db
      .from(kind.table)
      .update(update)
      .eq('id', id)
      .select(kind.columns)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new ApiError('ENTRY_NOT_FOUND', kind.notFound);

    return NextResponse.json(kind.toProfile(data as never));
  });

  /* Archives rather than deletes. Clients and invoices may reference the
     profile, and archiving keeps the row resolvable rather than silently
     orphaning them. */
  const DELETE = handle(async (req: Request, ctx: Ctx) => {
    const { db } = await requireSession(req);
    const { id } = await ctx.params;

    /* Read the flag BEFORE archiving: `returning` hands back the updated
       row, where `is_default` has already been cleared, so asking afterwards
       would say "not the default" every time and promote nobody. */
    const { data: before, error: beforeError } = await db
      .from(kind.table)
      .select('id, is_default')
      .eq('id', id)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) throw new ApiError('ENTRY_NOT_FOUND', kind.notFound);

    const { error } = await db
      .from(kind.table)
      .update({ archived_at: new Date().toISOString(), is_default: false })
      .eq('id', id);
    if (error) throw error;

    /* Archiving the default would leave a user with other live profiles
       and none of them the default, so the next invoice resolves to
       nothing. The default moves to a survivor rather than evaporating. */
    if (before.is_default) await promoteHeir(db, kind);

    return new NextResponse(null, { status: 204 });
  });

  return { GET, PATCH, DELETE };
}

/** The columns a `PATCH` writes; refused when it names none. */
function patchColumns<P>(patch: { archived?: boolean }, kind: ProfileKind<P>) {
  const update = toColumns(patch, kind.fields);
  if (patch.archived !== undefined) {
    update.archived_at = patch.archived ? new Date().toISOString() : null;
  }
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }
  return update;
}

/** A retried create whose id already landed answers with that row;
 *  any other insert error is rethrown. */
async function replayed<P>(
  db: SupabaseClient,
  kind: ProfileKind<P>,
  error: { code?: string },
  id: string | undefined,
) {
  const found =
    error.code === '23505' && id ? await readProfile(db, kind, id) : null;
  if (!found) throw error;
  return found;
}

async function clearDefault<P>(
  db: SupabaseClient,
  kind: ProfileKind<P>,
  except?: string,
) {
  let query = db
    .from(kind.table)
    .update({ is_default: false })
    .eq('is_default', true);
  if (except) query = query.neq('id', except);
  const { error } = await query;
  if (error) throw error;
}

async function isOnlyLive<P>(
  db: SupabaseClient,
  kind: ProfileKind<P>,
  id: string,
) {
  const { data, error } = await db
    .from(kind.table)
    .select('id')
    .is('archived_at', null)
    .neq('id', id);
  if (error) throw error;
  return (data ?? []).length === 0;
}

async function promoteHeir<P>(db: SupabaseClient, kind: ProfileKind<P>) {
  const { data, error } = await db
    .from(kind.table)
    .select('id')
    .is('archived_at', null)
    .order('name');
  if (error) throw error;

  const heir = (data ?? [])[0] as { id: string } | undefined;
  if (!heir) return;
  const { error: promoteError } = await db
    .from(kind.table)
    .update({ is_default: true })
    .eq('id', heir.id);
  if (promoteError) throw promoteError;
}

async function mustRead<P>(
  db: SupabaseClient,
  kind: ProfileKind<P>,
  id: string,
) {
  const found = await readProfile(db, kind, id);
  if (!found) throw new ApiError('ENTRY_NOT_FOUND', kind.notFound);
  return found;
}

/** The row, or `null` if the id is not the caller's. */
async function readProfile<P>(
  db: SupabaseClient,
  kind: ProfileKind<P>,
  id: string,
) {
  const { data, error } = await db
    .from(kind.table)
    .select(kind.columns)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? kind.toProfile(data as never) : null;
}
