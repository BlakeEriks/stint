'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Field, inputClass, textareaClass } from './field';
import {
  api,
  ApiError,
  type PaymentProfile,
  type PaymentProfileInput,
} from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';

type Draft = Partial<PaymentProfile> & { name: string };

const EMPTY: Draft = { name: '', accountType: 'checking' };

/**
 * Radix reserves the empty string on a SelectItem — it is how a Select is
 * cleared — so the "Not specified" row of a nullable column needs a value of
 * its own, mapped back to null on the way into the draft.
 */
const UNSET = 'unset';

/**
 * Bank details.
 *
 * US rails are the default path — account number plus ACH routing. IBAN,
 * SWIFT, a labelled national code and intermediary-bank fields are real but
 * additive, so they sit behind a disclosure rather than padding the form a
 * US contractor actually fills in.
 */
export function PaymentProfileDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: PaymentProfile;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showInternational, setShowInternational] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(existing ? { ...existing } : EMPTY);
    // Open the section if the profile already uses any of it.
    setShowInternational(
      Boolean(existing?.iban || existing?.swiftBic || existing?.localCode),
    );
  }, [open, existing]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: (body: PaymentProfileInput) =>
      existing
        ? api.updatePaymentProfile(existing.id, body)
        : api.createPaymentProfile(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.paymentProfiles() });
      onOpenChange(false);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const blank = (v: unknown) =>
      typeof v === 'string' && v.trim() === '' ? null : v;
    const body = Object.fromEntries(
      Object.entries(draft).map(([k, v]) => [k, blank(v)]),
    ) as PaymentProfileInput;
    save.mutate({ ...body, name: draft.name.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? 'Edit payment details' : 'Payment details'}
          </DialogTitle>
          <DialogDescription>
            These render on the invoice PDF. Only the fields you fill in appear.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label="Label"
            htmlFor="pp-name"
            required
            hint="For you, not the client — e.g. “Chase business”."
          >
            <Input
              id="pp-name"
              required
              autoFocus
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Chase business"
            />
          </Field>

          <Field label="Account holder" htmlFor="pp-holder">
            <Input
              id="pp-holder"
              value={draft.accountHolderName ?? ''}
              onChange={(e) => set('accountHolderName', e.target.value)}
              placeholder="Your name or LLC"
            />
          </Field>

          <Field label="Bank name" htmlFor="pp-bank">
            <Input
              id="pp-bank"
              value={draft.bankName ?? ''}
              onChange={(e) => set('bankName', e.target.value)}
              placeholder="Chase"
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <Field
              label="Account number"
              htmlFor="pp-acct"
              className="flex-1 basis-44"
            >
              <Input
                id="pp-acct"
                value={draft.accountNumber ?? ''}
                onChange={(e) => set('accountNumber', e.target.value)}
                inputMode="numeric"
              />
            </Field>

            <Field
              label="Routing number"
              htmlFor="pp-routing"
              hint="ACH / ABA, 9 digits."
              className="flex-1 basis-44"
            >
              <Input
                id="pp-routing"
                value={draft.routingNumber ?? ''}
                onChange={(e) => set('routingNumber', e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field label="Account type" htmlFor="pp-type">
            <Select
              value={draft.accountType ?? UNSET}
              onValueChange={(v) =>
                set(
                  'accountType',
                  (v === UNSET ? null : v) as PaymentProfile['accountType'],
                )
              }
            >
              <SelectTrigger id="pp-type" className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Not specified</SelectItem>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex flex-wrap gap-4">
            <Field
              label="Payment link label"
              htmlFor="pp-link-label"
              className="flex-1 basis-44"
            >
              <Input
                id="pp-link-label"
                value={draft.paymentLinkLabel ?? ''}
                onChange={(e) => set('paymentLinkLabel', e.target.value)}
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
                value={draft.paymentLinkUrl ?? ''}
                onChange={(e) => set('paymentLinkUrl', e.target.value)}
                placeholder="https://…"
              />
            </Field>
          </div>

          <Field
            label="Notes"
            htmlFor="pp-notes"
            hint="Printed under the payment block."
          >
            <textarea
              id="pp-notes"
              rows={2}
              value={draft.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              className={textareaClass}
            />
          </Field>

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
            <div className="flex flex-col gap-4 rounded-lg border border-edge-subtle p-4">
              <div className="flex flex-wrap gap-4">
                <Field
                  label="IBAN"
                  htmlFor="pp-iban"
                  className="flex-1 basis-44"
                >
                  <Input
                    id="pp-iban"
                    value={draft.iban ?? ''}
                    onChange={(e) => set('iban', e.target.value)}
                  />
                </Field>
                <Field
                  label="SWIFT / BIC"
                  htmlFor="pp-swift"
                  className="flex-1 basis-44"
                >
                  <Input
                    id="pp-swift"
                    value={draft.swiftBic ?? ''}
                    onChange={(e) => set('swiftBic', e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-4">
                <Field
                  label="Local code label"
                  htmlFor="pp-local-label"
                  hint="e.g. Sort code, BSB, IFSC."
                  className="flex-1 basis-44"
                >
                  <Input
                    id="pp-local-label"
                    value={draft.localCodeLabel ?? ''}
                    onChange={(e) => set('localCodeLabel', e.target.value)}
                  />
                </Field>
                <Field
                  label="Local code"
                  htmlFor="pp-local"
                  className="flex-1 basis-44"
                >
                  <Input
                    id="pp-local"
                    value={draft.localCode ?? ''}
                    onChange={(e) => set('localCode', e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Intermediary bank" htmlFor="pp-int-bank">
                <Input
                  id="pp-int-bank"
                  value={draft.intermediaryBankName ?? ''}
                  onChange={(e) => set('intermediaryBankName', e.target.value)}
                />
              </Field>

              <div className="flex flex-wrap gap-4">
                <Field
                  label="Intermediary SWIFT"
                  htmlFor="pp-int-swift"
                  className="flex-1 basis-44"
                >
                  <Input
                    id="pp-int-swift"
                    value={draft.intermediarySwiftBic ?? ''}
                    onChange={(e) =>
                      set('intermediarySwiftBic', e.target.value)
                    }
                  />
                </Field>
                <Field
                  label="Intermediary account"
                  htmlFor="pp-int-acct"
                  className="flex-1 basis-44"
                >
                  <Input
                    id="pp-int-acct"
                    value={draft.intermediaryAccountNumber ?? ''}
                    onChange={(e) =>
                      set('intermediaryAccountNumber', e.target.value)
                    }
                  />
                </Field>
              </div>

              <Field
                label="Fee allocation"
                htmlFor="pp-fees"
                hint="Who pays the wire fees."
              >
                <Select
                  value={draft.feeAllocation ?? UNSET}
                  onValueChange={(v) =>
                    set(
                      'feeAllocation',
                      (v === UNSET
                        ? null
                        : v) as PaymentProfile['feeAllocation'],
                    )
                  }
                >
                  <SelectTrigger id="pp-fees" className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>Not specified</SelectItem>
                    <SelectItem value="OUR">OUR — you pay all fees</SelectItem>
                    <SelectItem value="SHA">SHA — shared</SelectItem>
                    <SelectItem value="BEN">
                      BEN — client pays all fees
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}

          {save.error ? (
            <p role="alert" className="type-support text-danger">
              {save.error instanceof ApiError
                ? save.error.message
                : 'Could not save these details.'}
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
            <Button
              type="submit"
              variant="accent"
              disabled={save.isPending || draft.name.trim() === ''}
            >
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
