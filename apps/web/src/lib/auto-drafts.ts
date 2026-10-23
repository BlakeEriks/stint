import type { SupabaseClient } from '@supabase/supabase-js';
import { duePeriods, formatCurrency, localDateKey } from '@stint/core';
import { CreateInvoice } from '@stint/schema';
import { ApiError, dbCode, PG } from './errors';
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
 * The daily job: a draft for each scheduled client's period, and one email
 * to the user once a period has ended. `db` is the service client, so every
 * read here names its user; nothing relies on RLS to scope it.
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

  const done = { created: 0, deleted: 0, emailed: 0 };
  for (const u of users ?? []) {
    const tz = (u.time_zone as string | null) ?? 'UTC';
    const today = localDateKey(now, tz);
    // Every invoice needs a sender; the inbox asks for one meanwhile.
    if (u.business_name?.trim() && u.business_email?.trim())
      done.created += await draftPeriods(db, u.user_id, tz, today);
    const ended = await endPeriods(db, u.user_id, tz, today, u.ready_email);
    done.deleted += ended.deleted;
    done.emailed += ended.emailed;
  }
  return done;
}

/** A draft for each scheduled client's last ended period that billed
 *  something, and its current one, unless an invoice covers either. */
async function draftPeriods(
  db: SupabaseClient,
  userId: string,
  tz: string,
  today: string,
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
    for (const p of duePeriods(today, schedule)) {
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
          // A period under way collects its work as it's logged; one already
          // ended is drafted only if it has something to bill.
          { auto: true, emptyOk: p.periodEnd >= today },
        );
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
  }
  return created;
}

/** Each of the job's drafts whose period has ended: deleted if it bills
 *  nothing and was never numbered, else the user told it's ready, once. */
async function endPeriods(
  db: SupabaseClient,
  userId: string,
  tz: string,
  today: string,
  readyEmail: boolean,
) {
  const { data, error } = await db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('user_id', userId)
    .eq('auto', true)
    .eq('status', 'draft')
    .lt('period_end', today);
  if (error) throw error;

  const done = { deleted: 0, emailed: 0 };
  for (const stored of (data ?? []) as InvoiceRow[]) {
    const { row, lines } = await refreshDraft(db, stored, tz);
    if (row.invoice_number === null && lines?.length === 0) {
      const { error: deleteError } = await db
        .from('invoices')
        .delete()
        .eq('id', row.id)
        .eq('user_id', userId);
      if (deleteError) throw deleteError;
      done.deleted++;
    } else if (readyEmail && (await tellReady(db, userId, row))) {
      done.emailed++;
    }
  }
  return done;
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
