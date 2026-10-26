'use client';

import { useState } from 'react';
import { parseTermsDays } from '@stint/core';
import { NEXT_INVOICE_NUMBER_MAX } from '@stint/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Monitor, Moon, Sun } from 'lucide-react';
import { type Segment, SegmentedControl } from './segmented-control';
import { Field, Section, textareaClass } from './field';
import { RateInput, parseRate } from './rate-input';
import { SaveIndicator } from './save-indicator';
import { useAutosave } from '@/lib/client/use-autosave';
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
 * falls back to, so nothing needs reviewing before it commits. Edits persist
 * on their own after a pause, and each section owns its own autosave so the
 * indicator refers to the fields the user is looking at.
 *
 * Seeded from the server's answer once, rather than controlled by the query:
 * an autosave invalidates `settings`, and a form that followed every refetch
 * would overwrite what the user is typing with what it last sent. The page
 * holds it until that answer is in.
 */
export function SettingsForm({ loaded }: { loaded: Settings }) {
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { data: server } = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });

  const [form, setForm] = useState<Settings>(loaded);
  /* Text, not the number: a cleared field is a step in typing a new one,
     not a value to save. */
  const [next, setNext] = useState(String(loaded.nextInvoiceNumber));
  const [terms, setTerms] = useState(String(loaded.paymentTermsDays));
  const termsDays = parseTermsDays(terms);

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
  const nextError = numberRefusal(numbering.error);

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
        description="What a client or project falls back to when it sets no rate of its own."
        aside={<SaveIndicator state={billing.state} />}
      >
        <div className="flex flex-wrap gap-4">
          <Field
            label="Default hourly rate"
            htmlFor="rate"
            className="flex-1 basis-44"
          >
            <RateInput
              id="rate"
              value={form.defaultHourlyRate ?? ''}
              onChange={(e) =>
                setBilling('defaultHourlyRate', parseRate(e.target.value))
              }
              placeholder="100.00"
            />
          </Field>

          <Field
            label="Flag entries over"
            htmlFor="max-hours"
            hint="Hours. Blank turns it off."
            className="flex-1 basis-44"
          >
            <Input
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
            hint="Days to pay. 0 is due on receipt."
            error={
              terms !== '' && termsDays === null
                ? 'Whole days, 0 to 365.'
                : undefined
            }
            className="flex-1 basis-44"
          >
            <Input
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
      </Section>

      <Section
        title="Business identity"
        description="Appears in the invoice header."
        aside={<SaveIndicator state={identity.state} />}
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
      </Section>

      {/* New invoice links here, so Next number comes first: it is the
          field that link focuses. */}
      <Section
        id="numbering"
        title="Invoice numbering"
        aside={<SaveIndicator state={numbering.state} />}
      >
        <div className="flex flex-wrap gap-4">
          <Field
            label="Next number"
            htmlFor="next-number"
            hint="Start past invoices sent before Stint. It only moves forward."
            error={nextError}
            className="flex-1 basis-40"
          >
            <Input
              id="next-number"
              type="number"
              min={server?.nextInvoiceNumber ?? 1}
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

/** The number the next invoice takes, when the server refused the one sent. */
function refusedNumber(error: unknown) {
  if (!(error instanceof ApiError)) return undefined;
  const details = error.details as
    | { field?: string; current?: number }
    | undefined;
  return details?.field === 'nextInvoiceNumber' ? details.current : undefined;
}

/** The server's reason it refused the number, for the field it names. */
function numberRefusal(error: Error | null) {
  return refusedNumber(error) === undefined ? undefined : error?.message;
}
