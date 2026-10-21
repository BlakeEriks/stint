'use client';

import { useState } from 'react';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BILLING_PERIODS,
  localDateKey,
  type BillingPeriod,
  type BillingSchedule,
} from '@stint/core';
import { timeZone as tz } from '@/lib/client/use-timer';
import { ColorPicker } from './color-picker';
import { Field, inputClass } from './field';
import { RateInput, parseRate } from './rate-input';
import { api, ApiError, type Client, type ClientInput } from '@/lib/client/api';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

/**
 * Create and edit are the same form — the only difference is which request
 * it issues, so they cannot drift in validation or field set.
 *
 * Rate and tax are optional: a client with no rate falls back to the user
 * default, and a US contractor invoicing services usually owes no tax at all.
 *
 * What happens after a save is injected, because two dialogs render it:
 * `ClientDialog` closes, and the project dialog hands the new client back to
 * the select that asked for it.
 */
export function ClientForm({
  existing,
  onSaved,
  onCancel,
  footer,
}: {
  existing?: Client;
  onSaved: (client: Client) => void;
  onCancel: () => void;
  /** A secondary action, at the far left from Save, e.g. the dialog's
      Archive. */
  footer?: React.ReactNode;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [hourlyRate, setHourlyRate] = useState(
    existing?.hourlyRate != null ? String(existing.hourlyRate) : '',
  );
  const [taxRate, setTaxRate] = useState(
    existing?.taxRate != null ? String(existing.taxRate) : '',
  );
  const [color, setColor] = useState<string | null>(existing?.color ?? null);
  const [schedule, setSchedule] = useState<BillingSchedule | null>(
    existing?.billingSchedule ?? null,
  );

  const save = useSaveClient(existing, onSaved);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: name.trim(),
      // Empty is "unset", not empty string — the column is nullable and the
      // schema rejects a blank email.
      email: email.trim() || null,
      address: address.trim() || null,
      hourlyRate: parseRate(hourlyRate),
      taxRate: taxRate.trim() === '' ? null : Number(taxRate),
      color,
      billingSchedule: schedule,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label="Name" htmlFor="client-name" required>
        <Input
          id="client-name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Corp"
        />
      </Field>

      <Field label="Email" htmlFor="client-email">
        <Input
          id="client-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="billing@acme.com"
        />
      </Field>

      <Field
        label="Address"
        htmlFor="client-address"
        hint="Appears on the invoice."
      >
        <textarea
          id="client-address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={'123 Main St\nAustin, TX 78701'}
          className="w-full rounded-md border border-edge-default bg-transparent px-3 py-2
                     type-control text-strong placeholder:text-subtle outline-none
                     focus-visible:border-edge-focus focus-visible:ring-[3px]
                     focus-visible:ring-edge-focus"
        />
      </Field>

      <div className="flex flex-wrap gap-4">
        <Field
          label="Hourly rate"
          htmlFor="client-rate"
          hint="Defaults to your standard rate."
          className="flex-1 basis-40"
        >
          <RateInput
            id="client-rate"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="150.00"
          />
        </Field>

        <Field
          label="Tax rate %"
          htmlFor="client-tax"
          hint="Usually none for US services."
          className="flex-1 basis-40"
        >
          <Input
            id="client-tax"
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <ScheduleField value={schedule} onChange={setSchedule} />

      <ColorPicker value={color} onChange={setColor} />

      {save.error ? (
        <p role="alert" className="type-support text-danger">
          {save.error instanceof ApiError
            ? save.error.message
            : 'Could not save this client.'}
        </p>
      ) : null}

      {/* The one order for every dialog's and form's actions: a secondary
          one (Archive) at the far left, then Cancel, then Save at the
          bottom right (.claude/rules/web-ui.md). */}
      <div className="flex items-center justify-end gap-2">
        {footer ? <div className="mr-auto">{footer}</div> : null}
        {/* No icon: Cancel undoes the intent rather than performing one, and
            a glyph would give a dismissal the same weight as the save it
            sits beside. */}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="accent"
          disabled={save.isPending || name.trim() === ''}
        >
          {save.isPending ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Check aria-hidden />
          )}
          {save.isPending
            ? 'Saving…'
            : existing
              ? 'Save changes'
              : 'Add client'}
        </Button>
      </div>
    </form>
  );
}

/** Each schedule as the select names it; the list and the invoice hint
 *  lowercase it. */
export const SCHEDULE_LABELS: Record<BillingPeriod, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
};

const NONE = 'none';

/** Weekly and every two weeks count from a date one period starts on, so
 *  they reveal it, starting at today so a save never lacks one. */
function ScheduleField({
  value,
  onChange,
}: {
  value: BillingSchedule | null;
  onChange: (value: BillingSchedule | null) => void;
}) {
  const pick = (period: string) => {
    if (period === 'weekly' || period === 'biweekly')
      onChange({
        period,
        anchor:
          value && 'anchor' in value
            ? value.anchor
            : localDateKey(new Date(), tz),
      });
    else if (period === 'semimonthly' || period === 'monthly')
      onChange({ period });
    else onChange(null);
  };
  return (
    <div className="flex flex-wrap gap-4">
      <Field
        label="Billing schedule"
        htmlFor="client-schedule"
        hint="Sets each new invoice's dates."
        className="flex-1 basis-40"
      >
        <Select value={value?.period ?? NONE} onValueChange={pick}>
          <SelectTrigger id="client-schedule" className={inputClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {BILLING_PERIODS.map((p) => (
              <SelectItem key={p} value={p}>
                {p === 'semimonthly'
                  ? 'Twice a month: 1st–15th, 16th–end'
                  : SCHEDULE_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {value && 'anchor' in value ? (
        <Field
          label="First period starts"
          htmlFor="client-anchor"
          className="flex-1 basis-40"
        >
          <Input
            id="client-anchor"
            type="date"
            required
            value={value.anchor}
            onChange={(e) => onChange({ ...value, anchor: e.target.value })}
          />
        </Field>
      ) : null}
    </div>
  );
}

/**
 * Pending: the server validates the client, and the form stays to say what
 * it refused.
 */
export function useSaveClient(
  existing: Client | undefined,
  onSaved: (client: Client) => void,
) {
  return useOptimisticMutation({
    queryKey: () => keys.clients(),
    inline: true,
    mutationFn: (body: ClientInput) =>
      existing ? api.updateClient(existing.id, body) : api.createClient(body),
    /* The client's rate is what unbilled work is valued at — and every
       other rollup reads the same entries through the same rate chain, so
       refreshing `stats` alone leaves the activity list disagreeing with
       the figure above it. */
    invalidate: (qc) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.clients() }),
        invalidateEntryData(qc),
      ]),
    onSuccess: onSaved,
  });
}
