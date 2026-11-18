'use client';

import { useState } from 'react';
import { parseTermsDays } from '@stint/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Moon, Sun } from 'lucide-react';
import { type Segment, SegmentedControl } from './segmented-control';
import { Field, Section } from './field';
import { parseRate, RateInput, UnitInput } from './rate-input';
import { SaveIndicator } from './save-indicator';
import {
  emailError,
  type Identity,
  IdentityFields,
  NumberFields,
  nextNumberError,
} from './settings-fields';
import { useAutosave } from '@/lib/client/use-autosave';
import { TemplateControl } from './template-dialog';
import { ZoneSelect } from './zone-select';
import {
  api,
  ApiError,
  type Settings,
  type SettingsInput,
} from '@/lib/client/api';
import { type Theme, useTheme } from '@/lib/client/use-theme';
import { keys, invalidateEntryData } from '@stint/client';

const IDENTITY_KEYS = {
  name: 'businessName',
  email: 'businessEmail',
  address: 'businessAddress',
} as const;

const THEMES: Segment<Theme>[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/**
 * Settings. No save button: every field here is a preference, so nothing
 * needs reviewing before it commits. Edits persist
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

  const [form, setForm] = useState<Settings>(loaded);
  /* Text, not the number: a cleared field is a step in typing a new one,
     not a value to save. */
  const [next, setNext] = useState(String(loaded.nextInvoiceNumber));
  /* The typed text, so an email that fails its check shows while the last
     one saved stays. */
  const [identityText, setIdentityText] = useState<Identity>({
    name: loaded.businessName ?? '',
    email: loaded.businessEmail ?? '',
    address: loaded.businessAddress ?? '',
  });

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
  const inbox = useAutosave(persist);
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
  const setInbox = edit(inbox);
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

      <Section title="Billing" aside={<SaveIndicator state={billing.state} />}>
        <div className="flex flex-wrap gap-4">
          <Field
            label="Default hourly rate"
            htmlFor="rate"
            hint="Used when a client or project has none."
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

          <ParsedField
            label="Payment terms"
            id="terms"
            unit="days"
            hint="Used when a client has none."
            placeholder="30"
            parse={(text) => parseTermsDays(text) ?? undefined}
            error="Whole days, 0 to 365."
            value={form.paymentTermsDays}
            onChange={(days) => {
              if (days !== null) setBilling('paymentTermsDays', days);
            }}
          />
        </div>

        <Field
          label="Billing time zone"
          htmlFor="billing-zone"
          hint="Invoices read their dates in it, wherever you are."
        >
          <ZoneSelect
            id="billing-zone"
            value={form.billingTimeZone}
            onChange={(zone) => setBilling('billingTimeZone', zone)}
            unset="Not set"
          />
        </Field>
      </Section>

      <Section
        title="Inbox"
        description="What gets flagged for you to review."
        aside={<SaveIndicator state={inbox.state} />}
      >
        <div className="flex flex-wrap gap-4">
          <ParsedField
            label="Flag entries under"
            id="min-seconds"
            unit="seconds"
            parse={threshold(Number.isInteger)}
            error="Whole seconds, 1 or more."
            value={form.minEntrySeconds}
            onChange={(n) => setInbox('minEntrySeconds', n)}
          />
          <ParsedField
            label="Flag entries over"
            id="max-hours"
            unit="hours"
            inputMode="decimal"
            parse={threshold((hours) => hours <= 24)}
            error="More than 0, up to 24."
            value={form.maxEntryHours}
            onChange={(n) => setInbox('maxEntryHours', n)}
          />
        </div>
      </Section>

      <Section
        title="Business identity"
        aside={<SaveIndicator state={identity.state} />}
      >
        <IdentityFields
          id="biz"
          value={identityText}
          onChange={(key, text) => {
            setIdentityText((v) => ({ ...v, [key]: text }));
            if (key === 'email' && text !== '' && emailError(text)) return;
            setIdentity(IDENTITY_KEYS[key], text.trim() || null);
          }}
          error={(key) =>
            key === 'email' && identityText.email !== ''
              ? emailError(identityText.email)
              : undefined
          }
        />
      </Section>

      <TemplateSection />

      <Section
        title="Invoice numbering"
        description="Continue the count from invoices you sent before Stint."
        aside={<SaveIndicator state={numbering.state} />}
      >
        <div className="flex flex-wrap gap-4">
          <NumberFields
            id="numbering"
            prefix={form.invoiceNumberPrefix}
            next={next}
            onPrefix={(prefix) => setNumbering('invoiceNumberPrefix', prefix)}
            onNext={(text) => {
              setNext(text);
              if (!nextNumberError(text)) {
                setNumbering('nextInvoiceNumber', Number(text));
              }
            }}
            nextError={
              nextError ?? (next === '' ? undefined : nextNumberError(next))
            }
          />
        </div>
      </Section>
    </>
  );
}

/** One side of the inbox's length check: blank turns it off, and a number
    must be over zero and pass `accepts`. */
function threshold(accepts: (n: number) => boolean) {
  return (text: string) => {
    if (text === '') return null;
    const n = Number(text);
    return n > 0 && accepts(n) ? n : undefined;
  };
}

/** A number typed as text, not `type="number"`, which reports a half-typed
    "-" as blank, and blank clears. Saved only once `parse` accepts it. A number
    the server would refuse stays in the field with `error` and is never
    scheduled, or autosave would resend it with every later edit. */
function ParsedField({
  label,
  id,
  unit,
  hint,
  placeholder,
  inputMode = 'numeric',
  parse,
  error,
  value,
  onChange,
}: {
  label: string;
  id: string;
  unit: string;
  hint?: string;
  placeholder?: string;
  inputMode?: 'numeric' | 'decimal';
  /** The value to save; undefined refuses the text. */
  parse: (text: string) => number | null | undefined;
  error: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  /* Blank is still being typed, never an error. */
  const refused = text !== '' && parse(text) === undefined;
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={refused ? error : undefined}
      className="flex-1 basis-44"
    >
      <UnitInput
        unit={unit}
        id={id}
        inputMode={inputMode}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parse(e.target.value);
          if (parsed !== undefined) onChange(parsed);
        }}
      />
    </Field>
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

/** Saved by its own dialog, apart from the autosaved fields around it. */
function TemplateSection() {
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });
  return (
    <Section
      title="Invoice template"
      description="How your invoices look. Every template prints the same details."
    >
      {settings ? (
        <Field label="Template" htmlFor="settings-template">
          <TemplateControl
            id="settings-template"
            template={settings.invoiceTemplate}
          />
        </Field>
      ) : null}
      <p className="type-support text-subtle">
        Drafts use it right away. A sent invoice keeps the template it was sent
        with.
      </p>
    </Section>
  );
}
