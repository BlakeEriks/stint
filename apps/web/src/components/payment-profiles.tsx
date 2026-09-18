'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Section } from './field';
import { PaymentProfileDialog } from './payment-profile-dialog';
import { api, ApiError, type PaymentProfile } from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';

/**
 * Bank details, as named bundles.
 *
 * These render on the invoice PDF and never in an email. A client can point
 * at a specific profile; otherwise the default applies, mirroring how rates
 * resolve.
 */
export function PaymentProfiles() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PaymentProfile | null>(null);
  const [creating, setCreating] = useState(false);

  const { data } = useQuery({
    queryKey: keys.paymentProfiles(),
    queryFn: api.paymentProfiles,
  });
  const profiles = (data?.paymentProfiles ?? []).filter((p) => !p.archivedAt);

  const makeDefault = useMutation({
    mutationFn: (id: string) =>
      api.updatePaymentProfile(id, { isDefault: true }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.paymentProfiles() }),
  });

  /* Which profile the failure belongs to. One mutation serves every row, so
     without this the message would have to sit at the foot of the card and
     could not say which "Make default" was refused — and this one decides
     which bank details print on an invoice, so a silent refusal means the
     next invoice carries the wrong account. */
  const failedOn =
    makeDefault.error != null ? (makeDefault.variables ?? null) : null;

  return (
    <Section
      title="Payment details"
      description="Printed on the invoice itself, never in an email — details that look the same every time make a change worth questioning."
    >
      {profiles.length === 0 ? (
        <p className="type-support text-subtle">
          No payment details yet. Invoices will render without a payment block.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="rounded-lg border border-edge-subtle px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate type-control text-primary">
                    {profile.name}
                    {profile.isDefault ? (
                      <span className="ml-2 rounded border border-edge-default px-1.5 py-px type-badge text-subtle">
                        Default
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate type-meta text-subtle">
                    {summarize(profile)}
                  </p>
                </div>

                {!profile.isDefault ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => makeDefault.mutate(profile.id)}
                    disabled={makeDefault.isPending}
                  >
                    Make default
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(profile)}
                >
                  Edit
                </Button>
              </div>

              {failedOn === profile.id ? (
                <p role="alert" className="mt-2 type-support text-danger">
                  {makeDefault.error instanceof ApiError
                    ? makeDefault.error.message
                    : 'Could not make this the default.'}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          variant="default"
          onClick={() => setCreating(true)}
        >
          Add payment details
        </Button>
      </div>

      <PaymentProfileDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        existing={editing ?? undefined}
      />
    </Section>
  );
}

/**
 * Never the full account number — a settings list is glanceable and often
 * on a shared screen. The last four is enough to tell two profiles apart.
 */
function summarize(p: PaymentProfile): string {
  const tail = (v: string | null) => (v ? `••••${v.slice(-4)}` : null);
  const parts = [
    p.bankName,
    tail(p.accountNumber) ?? tail(p.iban),
    p.routingNumber ? `ABA ${p.routingNumber}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No account details set';
}
