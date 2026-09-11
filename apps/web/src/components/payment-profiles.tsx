'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Section } from './field';
import { PaymentProfileDialog } from './payment-profile-dialog';
import { api, type PaymentProfile } from '@/lib/client/api';

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
    queryKey: ['payment-profiles'],
    queryFn: api.paymentProfiles,
  });
  const profiles = (data?.paymentProfiles ?? []).filter((p) => !p.archivedAt);

  const makeDefault = useMutation({
    mutationFn: (id: string) => api.updatePaymentProfile(id, { isDefault: true }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['payment-profiles'] }),
  });

  return (
    <Section
      title="Payment details"
      description="Printed on the invoice itself, never in an email — details that look the same every time make a change worth questioning."
    >
      {profiles.length === 0 ? (
        <p className="text-[13.5px] text-subtle">
          No payment details yet. Invoices will render without a payment block.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex items-center gap-3 rounded-lg border border-edge-subtle px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-primary">
                  {profile.name}
                  {profile.isDefault ? (
                    <span className="ml-2 rounded border border-edge-default px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wider text-subtle">
                      Default
                    </span>
                  ) : null}
                </p>
                <p className="tabular mt-0.5 truncate font-mono text-[11.5px] text-subtle">
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
                variant="secondary"
                size="sm"
                onClick={() => setEditing(profile)}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
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
