'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Field, Section, textareaClass } from './field';
import { SaveIndicator } from './save-indicator';
import { useAutosave } from '@/lib/client/use-autosave';
import { api, type Settings, type SettingsInput } from '@/lib/client/api';

/**
 * Settings.
 *
 * No save button: edits persist on their own after a pause, and each card
 * reports its own state. Settings are a pile of independent preferences, not
 * a transaction — there is nothing to review before committing, so a button
 * would only be a step between deciding and having it apply.
 *
 * Each card owns its own autosave so the indicator refers to the fields the
 * user is actually looking at.
 */
export function SettingsForm() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (data && form === null) setForm(data);
  }, [data, form]);

  /**
   * `nextInvoiceNumber` is server-owned — gapless numbering depends on
   * allocate_invoice_number() holding the row lock — so it never goes back.
   */
  const persist = async (patch: SettingsInput) => {
    const { nextInvoiceNumber: _omit, ...rest } = patch as SettingsInput & {
      nextInvoiceNumber?: number;
    };
    await api.updateSettings(rest);
    queryClient.invalidateQueries({ queryKey: ['settings'] });
  };

  const billing = useAutosave(persist);
  const identity = useAutosave(persist);
  const numbering = useAutosave(persist);

  if (isLoading || !form) {
    return <p className="text-[13.5px] text-subtle">Loading…</p>;
  }

  /** Update local state, then schedule that card's save with the new value. */
  const edit =
    (card: ReturnType<typeof useAutosave<SettingsInput>>) =>
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setForm((f) => (f ? { ...f, [key]: value } : f));
      card.schedule({ [key]: value } as SettingsInput);
    };

  const setBilling = edit(billing);
  const setIdentity = edit(identity);
  const setNumbering = edit(numbering);

  return (
    <>
      <Section
        title="Billing defaults"
        description="What a client or project falls back to when it sets no rate of its own."
        status={<SaveIndicator state={billing.state} />}
      >
        <div className="flex flex-wrap gap-4">
          <Field label="Default hourly rate" htmlFor="rate" className="flex-1 basis-44">
            <Input
              id="rate"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.defaultHourlyRate ?? ''}
              onChange={(e) =>
                setBilling(
                  'defaultHourlyRate',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              placeholder="150.00"
            />
          </Field>

          <Field
            label="Runaway timer after"
            htmlFor="max-hours"
            hint="Flagged, never trimmed."
            className="flex-1 basis-44"
          >
            <Input
              id="max-hours"
              type="number"
              min="1"
              max="24"
              step="1"
              value={form.maxTimerHours}
              onChange={(e) => setBilling('maxTimerHours', Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Payment terms" htmlFor="terms" hint="Printed on every invoice.">
          <Input
            id="terms"
            value={form.defaultPaymentTerms}
            onChange={(e) => setBilling('defaultPaymentTerms', e.target.value)}
            placeholder="Net 30"
          />
        </Field>
      </Section>

      <Section
        title="Business identity"
        description="Appears in the invoice header."
        status={<SaveIndicator state={identity.state} />}
      >
        <Field label="Business name" htmlFor="biz-name">
          <Input
            id="biz-name"
            value={form.businessName ?? ''}
            onChange={(e) => setIdentity('businessName', e.target.value || null)}
            placeholder="Your name or LLC"
          />
        </Field>

        <Field label="Email" htmlFor="biz-email">
          <Input
            id="biz-email"
            type="email"
            value={form.businessEmail ?? ''}
            onChange={(e) => setIdentity('businessEmail', e.target.value || null)}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Address" htmlFor="biz-address">
          <textarea
            id="biz-address"
            rows={3}
            value={form.businessAddress ?? ''}
            onChange={(e) => setIdentity('businessAddress', e.target.value || null)}
            placeholder={'123 Main St\nAustin, TX 78701'}
            className={textareaClass}
          />
        </Field>

        <Field
          label="Tax ID"
          htmlFor="tax-id"
          hint="EIN or SSN, as it should appear on a 1099."
        >
          <Input
            id="tax-id"
            value={form.taxId ?? ''}
            onChange={(e) => setIdentity('taxId', e.target.value || null)}
            placeholder="12-3456789"
          />
        </Field>
      </Section>

      <Section
        title="Invoice numbering"
        status={<SaveIndicator state={numbering.state} />}
      >
        <div className="flex flex-wrap gap-4">
          <Field label="Prefix" htmlFor="prefix" className="flex-1 basis-40">
            <Input
              id="prefix"
              value={form.invoiceNumberPrefix}
              onChange={(e) => setNumbering('invoiceNumberPrefix', e.target.value)}
              placeholder="INV-"
            />
          </Field>

          <Field
            label="Next number"
            hint="Set by the system so numbering stays gapless."
            className="flex-1 basis-40"
          >
            <p className="tabular flex h-9 items-center font-mono text-[14px] text-muted">
              {data?.nextInvoiceNumber ?? '—'}
            </p>
          </Field>
        </div>

        <Field
          label="Payment notice"
          htmlFor="notice"
          hint="A standing line under the payment block. Details that never change make a change worth challenging."
        >
          <textarea
            id="notice"
            rows={2}
            value={form.paymentNotice ?? ''}
            onChange={(e) => setNumbering('paymentNotice', e.target.value || null)}
            placeholder="We will never email you to change these bank details."
            className={textareaClass}
          />
        </Field>
      </Section>
    </>
  );
}
