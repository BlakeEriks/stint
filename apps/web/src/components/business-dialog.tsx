'use client';

import { useEffect, useState } from 'react';
import { useOptimisticMutation, keys } from '@stint/client';
import { Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  api,
  ApiError,
  type BusinessProfile,
  type BusinessProfileInput,
} from '@/lib/client/api';
import { useMissing } from '@/lib/client/use-missing';
import { Notice } from './notice';
import { emailError, type Identity, IdentityFields } from './settings-fields';

/**
 * Whether the invoice has no sender yet: no business, or one without an
 * email. The server refuses to make a draft without them; New invoice asks
 * before that. `undefined` is still loading.
 */
export const missingBusiness = (b: BusinessProfile | null | undefined) =>
  b === null || (b !== undefined && !b.email?.trim());

/** A list of businesses with `b` in it, once, as saved. */
export const withBusiness =
  (b: BusinessProfile) =>
  (d: { businessProfiles: BusinessProfile[] } | undefined) =>
    d && {
      ...d,
      businessProfiles: [...d.businessProfiles.filter((x) => x.id !== b.id), b],
    };

/**
 * Who an invoice is from: added or edited in Settings, or from New invoice
 * without leaving it. `existing` edits that business.
 */
export function BusinessDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: BusinessProfile;
  onSaved?: (business: BusinessProfile) => void;
}) {
  const [draft, setDraft] = useState<Identity>({
    name: '',
    email: '',
    address: '',
  });
  const check = useMissing({
    'biz-name': draft.name.trim() === '' ? 'Enter a business name.' : undefined,
    'biz-email': emailError(draft.email),
  });

  useEffect(() => {
    if (!open) return;
    setDraft({
      name: existing?.name ?? '',
      email: existing?.email ?? '',
      address: existing?.address ?? '',
    });
    check.reset();
  }, [open, existing, check.reset]);

  /* Pending: the server checks the email, and the dialog stays open to say
     what it refused. */
  const save = useOptimisticMutation({
    queryKey: () => keys.businessProfiles(),
    inline: true,
    mutationFn: (body: BusinessProfileInput) =>
      existing
        ? api.updateBusinessProfile(existing.id, body)
        : api.createBusinessProfile(body),
    onSuccess: (business) => {
      onSaved?.(business);
      onOpenChange(false);
    },
  });

  /* Archived, not deleted: invoices name the business they were from. The
     server hands the default on, and the list refetches to show which. */
  const archive = useOptimisticMutation({
    queryKey: () => keys.businessProfiles(),
    inline: true,
    mutationFn: (id: string) => api.archiveBusinessProfile(id),
    onSuccess: () => onOpenChange(false),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!check.passes()) return;
    save.mutate({
      name: draft.name.trim(),
      email: draft.email.trim(),
      address: draft.address.trim() || null,
    });
  };

  const error = save.error ?? archive.error;
  const pending = save.isPending || archive.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? 'Edit business' : 'New business'}
          </DialogTitle>
          <DialogDescription>
            Its name and email go at the top of each invoice from it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <IdentityFields
            id="biz"
            value={draft}
            onChange={(key, text) => setDraft((d) => ({ ...d, [key]: text }))}
            error={(key) => check.error(`biz-${key}`)}
            required
            readOnly={pending}
            autoFocus
          />

          {error ? (
            <p role="alert" className="type-support text-danger">
              {error instanceof ApiError
                ? error.message
                : 'Couldn’t save this business.'}
            </p>
          ) : null}

          <DialogFooter>
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                className="sm:mr-auto"
                disabled={pending}
                onClick={() => archive.mutate(existing.id)}
              >
                {archive.isPending ? 'Archiving…' : 'Archive'}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="accent" disabled={pending}>
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

/**
 * Why Save draft is disabled, and the way to fix it without leaving the
 * invoice: a first business, or an email for the one it is from.
 */
export function SenderNotice({
  business,
  onSaved,
}: {
  business: BusinessProfile | null | undefined;
  onSaved: (business: BusinessProfile) => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!missingBusiness(business)) return null;
  return (
    <div>
      <Notice
        title="Your business details are missing"
        detail="Name and email are needed to generate."
        action={
          <Button type="button" onClick={() => setAsking(true)}>
            Add details
          </Button>
        }
      />
      <BusinessDialog
        open={asking}
        onOpenChange={setAsking}
        existing={business ?? undefined}
        onSaved={onSaved}
      />
    </div>
  );
}
