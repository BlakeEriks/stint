'use client';

import { useState } from 'react';
import { parseTermsDays } from '@stint/core';
import { NEXT_INVOICE_NUMBER_MAX } from '@stint/schema';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Monitor, Moon, Sun } from 'lucide-react';
import { type Segment, SegmentedControl } from './segmented-control';
import { Field, Section, textareaClass } from './field';
import { missingRate, parseRate, RateInput, UnitInput } from './rate-input';
import { SaveIndicator } from './save-indicator';
import { useAutosave } from '@/lib/client/use-autosave';
import { TemplatePicker, useTemplateChoice } from './template-picker';
import { ZoneSelect } from './zone-select';
import {
  api,
  ApiError,
  type Settings,
  type SettingsInput,
} from '@/lib/client/api';
import { type Theme, useTheme } from '@/lib/client/use-theme';
import { keys, invalidateEntryData } from '@stint/client';

const THEMES: Segment<Theme>[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/**
 * Settings. No save button: every field here is a default something else
 * falls back to, so nothing needs reviewing before it commits. Typing
 * persists after a pause, and leaving a section's fields or making a choice
 * persists at once. Each section owns its own autosave so the indicator
 * refers to the fields the user is looking at, and a refusal shows the
 * server's reason at the field it names.
 *
 * Seeded from the server's answer once, rather than controlled by the query:
 * an autosave invalidates `settings`, and a form that followed every refetch
 * would overwrite what the user is typing with what it last sent. The page
 * holds it until that answer is in.
 */
export function SettingsForm({ loaded }: { loaded: Settings }) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const [form, setForm] = useState<Settings>(loaded);
  /* Text, not the number: a cleared field is a step in typing a new one,
     not a value to save. */
  const [next, setNext] = useState(String(loaded.nextInvoiceNumber));
  const [terms, setTerms] = useState(String(loaded.paymentTermsDays));
  const termsDays = parseTermsDays(terms);
  const [rate, setRate] = useState(
    loaded.defaultHourlyRate === null ? '' : String(loaded.defaultHourlyRate),
  );

  const persist = async (patch: SettingsInput) => {
    try {
      await api.updateSettings(patch);
    } catch (e) {
      /* A refused number leaves the number the next invoice takes, so
         a later save of another field never shows "Saved" beside one it
         won't use. */
      const current = refusedNumber(e);
      if (current !== undefined) setNext(String(current));
      throw e;
    }
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
      <Section
        title="Appearance"
        description="This device only."
        aside={
          <SegmentedControl
            label="Theme"
            value={theme}
            onValueChange={setTheme}
            segments={THEMES}
          />
        }
      />

      <Section
        title="Billing defaults"
        description="Used when a client or project has none of its own."
        aside={<SaveIndicator state={billing.state} />}
      >
        <SavesOnLeave card={billing}>
          <div className="flex flex-wrap gap-4">
            <Field
              label="Default hourly rate"
              htmlFor="rate"
              error={
                missingRate(rate) ?? refusal(billing.error, 'defaultHourlyRate')
              }
              className="flex-1 basis-44"
            >
              <RateInput
                id="rate"
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  if (missingRate(e.target.value) === undefined) {
                    setBilling('defaultHourlyRate', parseRate(e.target.value));
                  }
                }}
                placeholder="100.00"
              />
            </Field>

            <Field
              label="Flag entries over"
              htmlFor="max-hours"
              error={refusal(billing.error, 'maxEntryHours')}
              className="flex-1 basis-44"
            >
              <UnitInput
                unit="hours"
                id="max-hours"
                type="number"
                min="1"
                max="24"
                step="1"
                value={form.maxEntryHours ?? ''}
                onChange={(e) =>
                  setBilling(
                    'maxEntryHours',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
            </Field>

            <Field
              label="Payment terms"
              htmlFor="terms"
              error={
                terms !== '' && termsDays === null
                  ? 'Whole days, 0 to 365.'
                  : refusal(billing.error, 'paymentTermsDays')
              }
              className="flex-1 basis-44"
            >
              <UnitInput
                unit="days"
                id="terms"
                inputMode="numeric"
                value={terms}
                onChange={(e) => {
                  setTerms(e.target.value);
                  const days = parseTermsDays(e.target.value);
                  if (days !== null) setBilling('paymentTermsDays', days);
                }}
                placeholder="30"
              />
            </Field>
          </div>

          <Field
            label="Billing time zone"
            htmlFor="billing-zone"
            hint="Invoices read their dates in it, wherever you are."
            error={refusal(billing.error, 'billingTimeZone')}
          >
            <ZoneSelect
              id="billing-zone"
              value={form.billingTimeZone}
              onChange={(zone) => {
                setBilling('billingTimeZone', zone);
                void billing.saveNow();
              }}
              unset="Not set"
            />
          </Field>
        </SavesOnLeave>
      </Section>

      <Section
        title="Business identity"
        description="Appears in the invoice header."
        aside={<SaveIndicator state={identity.state} />}
      >
        <SavesOnLeave card={identity}>
          <Field
            label="Business name"
            htmlFor="biz-name"
            error={refusal(identity.error, 'businessName')}
          >
            <Input
              id="biz-name"
              value={form.businessName ?? ''}
              onChange={(e) =>
                setIdentity('businessName', e.target.value || null)
              }
              placeholder="Your name or LLC"
            />
          </Field>

          <Field
            label="Email"
            htmlFor="biz-email"
            error={refusal(identity.error, 'businessEmail')}
          >
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

          <Field
            label="Address"
            htmlFor="biz-address"
            error={refusal(identity.error, 'businessAddress')}
          >
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
        </SavesOnLeave>
      </Section>

      <TemplateSection />

      <Section
        title="Invoice numbering"
        description="Continue the count from invoices you sent before Stint."
        aside={<SaveIndicator state={numbering.state} />}
      >
        <SavesOnLeave card={numbering}>
          <div className="flex flex-wrap gap-4">
            <Field
              label="Prefix"
              htmlFor="prefix"
              error={refusal(numbering.error, 'invoiceNumberPrefix')}
              className="flex-1 basis-40"
            >
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
              htmlFor="next-number"
              error={refusal(numbering.error, 'nextInvoiceNumber')}
              className="flex-1 basis-40"
            >
              <Input
                id="next-number"
                type="number"
                max={NEXT_INVOICE_NUMBER_MAX}
                step="1"
                value={next}
                onChange={(e) => {
                  setNext(e.target.value);
                  if (e.target.value !== '') {
                    setNumbering('nextInvoiceNumber', Number(e.target.value));
                  }
                }}
              />
            </Field>
          </div>
        </SavesOnLeave>
      </Section>
    </>
  );
}

/** Sends a section's unsent edits as focus leaves one of its fields:
    leaving is the end of typing, so the pause has nothing to wait for. */
function SavesOnLeave({
  card,
  children,
}: {
  card: { saveNow: () => Promise<void> };
  children: React.ReactNode;
}) {
  return (
    <fieldset className="contents" onBlur={() => void card.saveNow()}>
      {children}
    </fieldset>
  );
}

/** The number the next invoice takes, when the server refused the one sent. */
function refusedNumber(error: unknown) {
  if (!(error instanceof ApiError)) return undefined;
  const details = error.details as
    | { field?: string; current?: number }
    | undefined;
  return details?.field === 'nextInvoiceNumber' ? details.current : undefined;
}

/** The server's reason a save was refused, when it names `field`: a
    refusal names it in `details.field`, a validation failure under
    `details.properties`. */
function refusal(error: Error | null, field: keyof Settings) {
  if (!(error instanceof ApiError)) return undefined;
  const details = error.details as
    | {
        field?: string;
        properties?: Partial<Record<string, { errors?: string[] }>>;
      }
    | undefined;
  if (details?.field === field) return error.message;
  return details?.properties?.[field]?.errors?.[0];
}

/** Saves on its own press, apart from the autosaved fields around it: a
 *  choice from four needs no pause to finish typing. */
function TemplateSection() {
  const { template, choose } = useTemplateChoice();
  return (
    <Section
      title="Invoice template"
      description="How your invoices look. Every template prints the same details."
    >
      <TemplatePicker value={template} onChange={choose} />
      <p className="type-support text-subtle">
        Drafts use it right away. A sent invoice keeps the template it was sent
        with.
      </p>
    </Section>
  );
}
