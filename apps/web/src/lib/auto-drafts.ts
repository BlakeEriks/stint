import type { SupabaseClient } from '@supabase/supabase-js';
import { formatCurrency, lastEndedPeriod, localDateKey } from '@stint/core';
import { CreateInvoice } from '@stint/schema';
import { ApiError, PG } from './errors';
import { createDraft, refreshDraft } from './invoicing';
import { sendMail } from './mail';
import {
  CLIENT_COLUMNS,
  INVOICE_COLUMNS,
  toBillingSchedule,
  type ClientRow,
  type InvoiceRow,
} from './rows';

/**
 * The daily job: once a scheduled client's period has ended, a draft for it
 * if it has something to bill, and one email telling the user it's ready.
 * `db` is the service client, so every read here names its user; nothing
 * relies on RLS to scope it.
 *
 * Safe to run any number of times: a period's draft is unique per client
 * (`invoices_one_auto_draft_per_period`), and an email is claimed before it
 * is sent.
 */
export async function runDrafts(db: SupabaseClient, now = new Date()) {
  const { data: users, error } = await db
    .from('user_settings')
    .select('user_id, time_zone, ready_email, business_name, business_email')
    .eq('auto_drafts', true);
  if (error) throw error;

  const done = { created: 0, emailed: 0 };
  /* One user's failure, a refused email say, doesn't stop the others; all
     of them are raised once every user has had their turn. */
  const failures: unknown[] = [];
  for (const u of users ?? []) {
    try {
      const tz = (u.time_zone as string | null) ?? 'UTC';
      // Every invoice needs a sender; the inbox asks for one meanwhile.
      if (u.business_name?.trim() && u.business_email?.trim())
        done.created += await draftEnded(db, u.user_id, tz, now);
      if (u.ready_email) done.emailed += await tellAll(db, u.user_id, tz);
    } catch (e) {
      failures.push(e);
    }
  }
  if (failures.length > 0)
    throw new AggregateError(failures, `${failures.length} users failed`);
  return done;
}

/** A draft for each scheduled client's last ended period that has
 *  something to bill, unless an invoice covers it. Live, so work logged
 *  late still joins it until it's sent. */
async function draftEnded(
  db: SupabaseClient,
  userId: string,
  tz: string,
  now: Date,
) {
  const { data: clients, error } = await db
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('user_id', userId)
    .not('billing_period', 'is', null)
    .is('archived_at', null);
  if (error) throw error;

  let created = 0;
  for (const client of (clients ?? []) as ClientRow[]) {
    const schedule = toBillingSchedule(client);
    if (!schedule) continue;
    const p = lastEndedPeriod(localDateKey(now, tz), schedule);
    /* Drafted once: a draft the user deleted stays deleted (Principle I). */
    if (
      client.auto_drafted_through !== null &&
      p.periodEnd <= client.auto_drafted_through
    )
      continue;
    const { data: covering, error: coverError } = await db
      .from('invoices')
      .select('id')
      .eq('user_id', userId)
      .eq('client_id', client.id)
      .neq('status', 'void')
      .lte('period_start', p.periodEnd)
      .gte('period_end', p.periodStart)
      .limit(1);
    if (coverError) throw coverError;
    if ((covering ?? []).length > 0) continue;
    try {
      await createDraft(
        db,
        userId,
        // New invoice's defaults for this client and period.
        CreateInvoice.parse({ clientId: client.id, ...p, tz }),
        { auto: true },
      );
      const { error: markError } = await db
        .from('clients')
        .update({ auto_drafted_through: p.periodEnd })
        .eq('id', client.id)
        .eq('user_id', userId);
      if (markError) throw markError;
      created++;
    } catch (e) {
      // Nothing to bill, or another run drafted it first.
      const skip =
        (e instanceof ApiError &&
          (e.code === 'INVALID_PERIOD' || e.code === 'DRAFT_OVERLAPS')) ||
        (e as { code?: string }).code === PG.UNIQUE_VIOLATION;
      if (!skip) throw e;
    }
  }
  return created;
}

/** The ready email for each of the job's drafts not yet told about. */
async function tellAll(db: SupabaseClient, userId: string, tz: string) {
  const { data, error } = await db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('user_id', userId)
    .eq('auto', true)
    .eq('status', 'draft')
    .is('ready_emailed_at', null);
  if (error) throw error;

  let emailed = 0;
  for (const stored of (data ?? []) as InvoiceRow[]) {
    // Its total as it is now, with any work logged since it was made.
    const { row } = await refreshDraft(db, stored, tz);
    if (await tellReady(db, userId, row)) emailed++;
  }
  return emailed;
}

/** One email per draft: claimed first, so a concurrent run sends none, and
 *  released if sending fails, so tomorrow's run tries again. */
async function tellReady(db: SupabaseClient, userId: string, row: InvoiceRow) {
  const { data: claimed, error } = await db
    .from('invoices')
    .update({ ready_emailed_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('user_id', userId)
    .is('ready_emailed_at', null)
    .select('id');
  if (error) throw error;
  if ((claimed ?? []).length === 0) return false;

  try {
    const { data: user, error: userError } =
      await db.auth.admin.getUserById(userId);
    if (userError) throw userError;
    await sendMail({
      to: user.user.email as string,
      subject: `Your invoice for ${row.client_name} is ready`,
      text: readyText(row),
    });
    return true;
  } catch (e) {
    const { error: releaseError } = await db
      .from('invoices')
      .update({ ready_emailed_at: null })
      .eq('id', row.id)
      .eq('user_id', userId);
    if (releaseError) throw releaseError;
    throw e;
  }
}

const day = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDay = (d: string) => day.format(new Date(`${d}T00:00:00Z`));

/** The email: no PDF and no payment details, only where to find it. */
export function readyText(row: InvoiceRow) {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? '';
  return [
    `Your draft invoice for ${row.client_name} is ready to send.`,
    '',
    `Period: ${shortDay(row.period_start)} – ${shortDay(row.period_end)}`,
    `Total: ${formatCurrency(Number(row.total), row.currency)}`,
    '',
    `Open it in Stint to download and send it:`,
    `${origin}/invoices/${row.id}`,
    '',
    'Stint never sends invoices to your clients.',
  ].join('\n');
}
