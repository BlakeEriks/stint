'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Field, inputClass, Section, textareaClass } from './field';
import { SaveIndicator } from './save-indicator';
import { useAutosave } from '@/lib/client/use-autosave';
import { api, type Settings, type SettingsInput } from '@/lib/client/api';
import { type Theme, useTheme } from '@/lib/client/use-theme';
import { Listing } from './page';
import { keys } from '@/lib/client/query-keys';

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
  const query = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });

  return (
    <Listing query={query}>{(loaded) => <Cards loaded={loaded} />}</Listing>
  );
}

/**
 * The cards, seeded from the server's answer once.
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
  /** What the unit select shows, which outlives an empty target. */
  const [goalUnit, setGoalUnit] = useState<'hours' | 'revenue'>(
    loaded.monthlyTargetUnit ?? 'hours',
  );

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
    /* The default rate and the monthly target are both inputs to the home
       cards, so a settings edit that leaves them stale contradicts itself. */
    queryClient.invalidateQueries({ queryKey: keys.stats() });
  };

  const billing = useAutosave(persist);
  const identity = useAutosave(persist);
  const numbering = useAutosave(persist);
  const goal = useAutosave(persist);

  /** Update local state, then schedule that card's save with the new value. */
  const edit =
    (card: ReturnType<typeof useAutosave<SettingsInput>>) =>
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
      card.schedule({ [key]: value } as SettingsInput);
    };

  const setBilling = edit(billing);
  const setIdentity = edit(identity);
  const setNumbering = edit(numbering);

  /* The target and its unit travel together: `schedule` replaces the queued
     payload rather than merging into it, so sending one key would drop the
     other mid-debounce. Clearing the target clears the unit with it — the
     database rejects one without the other.

     The unit the SELECT shows is held separately, because a unit chosen
     before a target has been typed cannot be persisted yet: writing it alone
     would violate the constraint, and writing null would snap the select back
     to Hours under the user mid-choice. */
  const setGoal = (target: number | null, unit: 'hours' | 'revenue') => {
    setGoalUnit(unit);
    const paired = target === null ? null : unit;
    setForm((f) => ({
      ...f,
      monthlyTarget: target,
      monthlyTargetUnit: paired,
    }));
    goal.schedule({ monthlyTarget: target, monthlyTargetUnit: paired });
  };

  return (
    <>
      {/* No SaveIndicator: the theme is a device preference in localStorage,
          not a row on `user_settings`, so it applies on click and there is no
          request to report. An indicator here would imply it syncs. */}
      <Section title="Appearance" description="This device only.">
        <Field label="Theme" htmlFor="theme">
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            className={inputClass}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
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

      {/* The Pace card on Home is the only thing that reads this. Leaving the
          target empty is a valid answer, not an unfinished one: the card stays
          away rather than nagging for a number the user does not work to. */}
      <Section
        id="goal"
        title="Monthly goal"
        description="Drives the Pace card on Home. Leave it empty for no goal."
        status={<SaveIndicator state={goal.state} />}
      >
        <div className="flex flex-wrap gap-4">
          <Field
            label="Target"
            htmlFor="goal-target"
            className="flex-1 basis-44"
          >
            <Input
              id="goal-target"
              type="number"
              min="0"
              step={goalUnit === 'revenue' ? '0.01' : '1'}
              inputMode="decimal"
              value={form.monthlyTarget ?? ''}
              onChange={(e) =>
                setGoal(
                  e.target.value === '' ? null : Number(e.target.value),
                  goalUnit,
                )
              }
              placeholder={goalUnit === 'revenue' ? '10000' : '120'}
            />
          </Field>

          <Field
            label="Measured in"
            htmlFor="goal-unit"
            /* Revenue is work DONE — invoiced plus unbilled at its resolved
               rate — never money collected, so a slow-paying client never
               makes the month look worse than it was. */
            hint="Revenue counts work done, not money collected."
            className="flex-1 basis-44"
          >
            <select
              id="goal-unit"
              value={goalUnit}
              onChange={(e) =>
                setGoal(
                  form.monthlyTarget,
                  e.target.value as 'hours' | 'revenue',
                )
              }
              className={inputClass}
            >
              <option value="hours">Hours</option>
              <option value="revenue">Revenue</option>
            </select>
          </Field>
        </div>
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
