'use client';

import { useEffect, useState } from 'react';
import { useOptimisticMutation, keys } from '@stint/client';
import { validateRoutingNumber } from '@stint/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Field, inputClass } from './field';
import {
  api,
  ApiError,
  type PaymentProfile,
  type PaymentProfileInput,
} from '@/lib/client/api';
import { useMissing, type Missing } from '@/lib/client/use-missing';

type Draft = Partial<PaymentProfile> & { name: string };

const EMPTY: Draft = { name: '', accountType: 'checking' };

/**
 * Radix reserves the empty string on a SelectItem — it is how a Select is
 * cleared — so the "Not specified" row of a nullable column needs a value of
 * its own, mapped back to null on the way into the draft.
 */
const UNSET = 'unset';

/* The server refuses a bad routing number too; checked here so the field
   itself says why. */
const missingIn = (draft: Draft): Missing => {
  const routing = draft.routingNumber ?? '';
  return {
    'pp-name':
      draft.name.trim() === '' ? 'Give these details a label.' : undefined,
    'pp-routing':
      routing.trim() !== '' && !validateRoutingNumber(routing)
        ? 'Not a valid routing number. Check its 9 digits with your bank.'
        : undefined,
  };
};

/** The body to send: a field left blank clears its column. */
const toInput = (draft: Draft): PaymentProfileInput => {
  const blank = (v: unknown) =>
    typeof v === 'string' && v.trim() === '' ? null : v;
  const body = Object.fromEntries(
    Object.entries(draft).map(([k, v]) => [k, blank(v)]),
  ) as PaymentProfileInput;
  return { ...body, name: draft.name.trim() };
};

type SetDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

/** The columns a plain text input edits. */
type TextKey = {
  [K in keyof Draft]-?: string extends NonNullable<Draft[K]> ? K : never;
}[keyof Draft];

/** A text input's `value` and `onChange` for one column. */
const binder =
  (draft: Draft, set: SetDraft) =>
  <K extends TextKey>(key: K) => ({
    value: draft[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, e.target.value as Draft[K]),
  });

/** A Select over a nullable column, its "Not specified" row being null. */
function NullableSelect<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T | null | undefined;
  onChange: (value: T | null) => void;
  options: [T, string][];
}) {
  return (
    <Select
      value={value ?? UNSET}
      onValueChange={(v) => onChange(v === UNSET ? null : (v as T))}
    >
      <SelectTrigger id={id} className={inputClass}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>Not specified</SelectItem>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Bank details.
 *
 * US rails are the default path — account number plus ACH routing. IBAN,
 * SWIFT, a labeled national code and intermediary-bank fields are real but
 * additive, so they sit behind a disclosure rather than padding the form a
 * US contractor actually fills in.
 */
export function PaymentProfileDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: PaymentProfile;
  onSaved?: (profile: PaymentProfile) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showInternational, setShowInternational] = useState(false);
  const check = useMissing(missingIn(draft));

  useEffect(() => {
    if (!open) return;
    setDraft(existing ? { ...existing } : EMPTY);
    check.reset();
    // Open the section if the profile already uses any of it.
    setShowInternational(
      Boolean(existing?.iban || existing?.swiftBic || existing?.localCode),
    );
  }, [open, existing, check.reset]);

  const set: SetDraft = (key, value) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const bind = binder(draft, set);

  /* Pending: the server validates the bank details, and the dialog stays
     open to say what it refused. */
  const save = useOptimisticMutation({
    queryKey: () => keys.paymentProfiles(),
    inline: true,
    mutationFn: (body: PaymentProfileInput) =>
      existing
        ? api.updatePaymentProfile(existing.id, body)
        : api.createPaymentProfile(body),
    onSuccess: (profile) => {
      onSaved?.(profile);
      onOpenChange(false);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!check.passes()) return;
    save.mutate(toInput(draft));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? 'Edit payment details' : 'Payment details'}
          </DialogTitle>
          <DialogDescription>
            Only the fields you fill in print on the invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field
            label="Label"
            htmlFor="pp-name"
            required
            hint="Only you see this."
            error={check.error('pp-name')}
          >
            <Input
              id="pp-name"
              required
              autoFocus
              {...bind('name')}
              placeholder="Chase business"
            />
          </Field>

          <Field label="Account holder" htmlFor="pp-holder">
            <Input
              id="pp-holder"
              {...bind('accountHolderName')}
              placeholder="Your name or LLC"
            />
          </Field>

          <Field label="Bank name" htmlFor="pp-bank">
            <Input id="pp-bank" {...bind('bankName')} placeholder="Chase" />
          </Field>

          <div className="flex flex-wrap gap-4">
            <Field
              label="Account number"
              htmlFor="pp-acct"
              className="flex-1 basis-44"
            >
              <Input
                id="pp-acct"
                {...bind('accountNumber')}
                inputMode="numeric"
              />
            </Field>

            <Field
              label="Routing number"
              htmlFor="pp-routing"
              hint="ACH / ABA, 9 digits."
              error={check.error('pp-routing')}
              className="flex-1 basis-44"
            >
              <Input
                id="pp-routing"
                {...bind('routingNumber')}
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field label="Account type" htmlFor="pp-type">
            <NullableSelect
              id="pp-type"
              value={draft.accountType}
              onChange={(v) => set('accountType', v)}
              options={[
                ['checking', 'Checking'],
                ['savings', 'Savings'],
              ]}
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <Field
              label="Payment link label"
              htmlFor="pp-link-label"
              className="flex-1 basis-44"
            >
              <Input
                id="pp-link-label"
                {...bind('paymentLinkLabel')}
                placeholder="Pay online"
              />
            </Field>
            <Field
              label="Payment link URL"
              htmlFor="pp-link-url"
              className="flex-1 basis-44"
            >
              <Input
                id="pp-link-url"
                type="url"
                {...bind('paymentLinkUrl')}
                placeholder="https://…"
              />
            </Field>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowInternational((v) => !v)}
              aria-expanded={showInternational}
              className="type-label text-subtle hover:text-muted"
            >
              {showInternational ? '− ' : '+ '}
              International details
            </button>
          </div>

          {showInternational ? (
            <InternationalFields draft={draft} set={set} />
          ) : null}

          {save.error ? (
            <p role="alert" className="type-support text-danger">
              {save.error instanceof ApiError
                ? save.error.message
                : 'Couldn’t save these details.'}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            {/* Icon plus label, like every other action in the app. The
                glyph is `aria-hidden`, so the accessible name is the label
                alone. */}
            <Button type="submit" variant="accent" disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Check aria-hidden />
              )}
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** IBAN, SWIFT, a labeled national code, and an intermediary bank. */
function InternationalFields({ draft, set }: { draft: Draft; set: SetDraft }) {
  const bind = binder(draft, set);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-edge-subtle p-4">
      <div className="flex flex-wrap gap-4">
        <Field label="IBAN" htmlFor="pp-iban" className="flex-1 basis-44">
          <Input id="pp-iban" {...bind('iban')} />
        </Field>
        <Field
          label="SWIFT / BIC"
          htmlFor="pp-swift"
          className="flex-1 basis-44"
        >
          <Input id="pp-swift" {...bind('swiftBic')} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-4">
        <Field
          label="Local code label"
          htmlFor="pp-local-label"
          hint="e.g. Sort code, BSB, IFSC."
          className="flex-1 basis-44"
        >
          <Input id="pp-local-label" {...bind('localCodeLabel')} />
        </Field>
        <Field
          label="Local code"
          htmlFor="pp-local"
          className="flex-1 basis-44"
        >
          <Input id="pp-local" {...bind('localCode')} />
        </Field>
      </div>

      <Field label="Intermediary bank" htmlFor="pp-int-bank">
        <Input id="pp-int-bank" {...bind('intermediaryBankName')} />
      </Field>

      <div className="flex flex-wrap gap-4">
        <Field
          label="Intermediary SWIFT"
          htmlFor="pp-int-swift"
          className="flex-1 basis-44"
        >
          <Input id="pp-int-swift" {...bind('intermediarySwiftBic')} />
        </Field>
        <Field
          label="Intermediary account"
          htmlFor="pp-int-acct"
          className="flex-1 basis-44"
        >
          <Input id="pp-int-acct" {...bind('intermediaryAccountNumber')} />
        </Field>
      </div>

      <Field
        label="Fee allocation"
        htmlFor="pp-fees"
        hint="Who pays the wire fees."
      >
        <NullableSelect
          id="pp-fees"
          value={draft.feeAllocation}
          onChange={(v) => set('feeAllocation', v)}
          options={[
            ['OUR', 'OUR — you pay all fees'],
            ['SHA', 'SHA — shared'],
            ['BEN', 'BEN — client pays all fees'],
          ]}
        />
      </Field>
    </div>
  );
}
