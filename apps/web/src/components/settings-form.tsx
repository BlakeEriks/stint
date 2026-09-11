'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Section, textareaClass } from './field';
import { api, ApiError, type SettingsInput } from '@/lib/client/api';

/**
 * Settings.
 *
 * Grouped by what the user is actually doing: billing defaults that every
 * client and project falls back to, the business identity printed on the
 * invoice, and how invoices are numbered.
 */
export function SettingsForm() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
  });

  const [form, setForm] = useState<SettingsInput>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = useMutation({
    mutationFn: (body: SettingsInput) => api.updateSettings(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // nextInvoiceNumber is server-owned; never send it back.
    const { nextInvoiceNumber: _omit, ...rest } = form as SettingsInput & {
      nextInvoiceNumber?: number;
    };
    save.mutate(rest);
  };

  if (isLoading) {
    return <p className="text-[13.5px] text-subtle">Loading…</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Section
        title="Billing defaults"
        description="What a client or project falls back to when it sets no rate of its own."
      >
        <div className="flex flex-wrap gap-4">
          <Field
            label="Default hourly rate"
            htmlFor="rate"
            className="flex-1 basis-44"
          >
            <Input
              id="rate"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.defaultHourlyRate ?? ''}
              onChange={(e) =>
                set(
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
              value={form.maxTimerHours ?? 8}
              onChange={(e) => set('maxTimerHours', Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Payment terms" htmlFor="terms" hint="Printed on every invoice.">
          <Input
            id="terms"
            value={form.defaultPaymentTerms ?? ''}
            onChange={(e) => set('defaultPaymentTerms', e.target.value)}
            placeholder="Net 30"
          />
        </Field>
      </Section>

      <Section
        title="Business identity"
        description="Appears in the invoice header."
      >
        <Field label="Business name" htmlFor="biz-name">
          <Input
            id="biz-name"
            value={form.businessName ?? ''}
            onChange={(e) => set('businessName', e.target.value || null)}
            placeholder="Your name or LLC"
          />
        </Field>

        <Field label="Email" htmlFor="biz-email">
          <Input
            id="biz-email"
            type="email"
            value={form.businessEmail ?? ''}
            onChange={(e) => set('businessEmail', e.target.value || null)}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Address" htmlFor="biz-address">
          <textarea
            id="biz-address"
            rows={3}
            value={form.businessAddress ?? ''}
            onChange={(e) => set('businessAddress', e.target.value || null)}
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
            onChange={(e) => set('taxId', e.target.value || null)}
            placeholder="12-3456789"
          />
        </Field>
      </Section>

      <Section title="Invoice numbering">
        <div className="flex flex-wrap gap-4">
          <Field label="Prefix" htmlFor="prefix" className="flex-1 basis-40">
            <Input
              id="prefix"
              value={form.invoiceNumberPrefix ?? ''}
              onChange={(e) => set('invoiceNumberPrefix', e.target.value)}
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
            onChange={(e) => set('paymentNotice', e.target.value || null)}
            placeholder="We will never email you to change these bank details."
            className={textareaClass}
          />
        </Field>
      </Section>

      {save.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {save.error instanceof ApiError
            ? save.error.message
            : 'Could not save settings.'}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        {saved ? (
          <span role="status" className="text-[13px] text-success">
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  );
}
