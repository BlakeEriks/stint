'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Field, inputClass, Section, textareaClass } from './field';
import { SaveIndicator } from './save-indicator';
import { useAutosave } from '@/lib/client/use-autosave';
import { api, type Settings, type SettingsInput } from '@/lib/client/api';
import { type Theme, useTheme } from '@/lib/client/use-theme';
import { Listing } from './page';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

/**
 * Settings. No save button: edits persist on their own after a pause, and
 * each section owns its own autosave so the indicator refers to the fields the
 * user is looking at.
 */
export function SettingsForm() {
  const query = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });

  return (
    <Listing query={query}>{(loaded) => <Cards loaded={loaded} />}</Listing>
  );
}

/**
 * The sections, seeded from the server's answer once.
 *
 * Seeded rather than controlled by the query: an autosave invalidates
 * `settings`, and a form that followed every refetch would overwrite what the
 * user is typing with what it last sent.
 */
function Cards({ loaded }: { loaded: Settings }) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { data: server } = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });

  const [form, setForm] = useState<Settings>(loaded);

  /**
   * `nextInvoiceNumber` is server-owned — gapless numbering depends on
   * allocate_invoice_number() holding the row lock — so it never goes back.
   */
  const persist = async (patch: SettingsInput) => {
    const { nextInvoiceNumber: _omit, ...rest } = patch as SettingsInput & {
      nextInvoiceNumber?: number;
    };
    await api.updateSettings(rest);
    queryClient.invalidateQueries({ queryKey: keys.settings() });
    /* The default rate is an input to every figure on Home, and it is the
       last link of the chain every rollup bills through, so they all go. */
    invalidateEntryData(queryClient);
  };

  const billing = useAutosave(persist);
  const identity = useAutosave(persist);
  const numbering = useAutosave(persist);

  /** Update local state, then schedule that section's save with the new value. */
  const edit =
    (card: ReturnType<typeof useAutosave<SettingsInput>>) =>
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
      card.schedule({ [key]: value } as SettingsInput);
    };

  const setBilling = edit(billing);
  const setIdentity = edit(identity);
  const setNumbering = edit(numbering);

  return (
    <>
      {/* No SaveIndicator: the theme is a device preference in localStorage,
          not a row on `user_settings`, so it applies on click and there is no
          request to report. An indicator here would imply it syncs. */}
      <Section title="Appearance" description="This device only.">
        <Field label="Theme" htmlFor="theme">
          <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <SelectTrigger id="theme" className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section
        title="Billing defaults"
        description="What a client or project falls back to when it sets no rate of its own."
        status={<SaveIndicator state={billing.state} />}
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
              onChange={(e) =>
                setBilling('maxTimerHours', Number(e.target.value))
              }
            />
          </Field>
        </div>

        <Field
          label="Payment terms"
          htmlFor="terms"
          hint="Printed on every invoice."
        >
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
            onChange={(e) =>
              setIdentity('businessName', e.target.value || null)
            }
            placeholder="Your name or LLC"
          />
        </Field>

        <Field label="Email" htmlFor="biz-email">
          <Input
            id="biz-email"
            type="email"
            value={form.businessEmail ?? ''}
            onChange={(e) =>
              setIdentity('businessEmail', e.target.value || null)
            }
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Address" htmlFor="biz-address">
          <textarea
            id="biz-address"
            rows={3}
            value={form.businessAddress ?? ''}
            onChange={(e) =>
              setIdentity('businessAddress', e.target.value || null)
            }
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
              onChange={(e) =>
                setNumbering('invoiceNumberPrefix', e.target.value)
              }
              placeholder="INV-"
            />
          </Field>

          <Field
            label="Next number"
            hint="Set by the system so numbering stays gapless."
            className="flex-1 basis-40"
          >
            {/* The server's value, never the seeded form's: this one is
                allocated under a row lock and the form never writes it. */}
            <p className="flex h-9 items-center type-duration text-muted">
              {server?.nextInvoiceNumber ?? '—'}
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
            onChange={(e) =>
              setNumbering('paymentNotice', e.target.value || null)
            }
            placeholder="We will never email you to change these bank details."
            className={textareaClass}
          />
        </Field>
      </Section>
    </>
  );
}
