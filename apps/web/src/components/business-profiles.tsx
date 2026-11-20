'use client';

import { useQuery } from '@tanstack/react-query';
import { useOptimisticMutation, keys } from '@stint/client';
import { useDialog } from '@/lib/client/use-dialog';
import { Button } from '@/components/ui/button';
import { api, type BusinessProfile } from '@/lib/client/api';
import { BusinessDialog } from './business-dialog';
import { Section } from './field';
import { ProfileRows } from './payment-profiles';

/**
 * Who an invoice can be from: the user as themself, and each LLC they bill
 * through. New invoice picks one; the default is the one a client with no
 * invoice yet gets.
 */
export function BusinessProfiles() {
  /* `undefined` adds a business; a business, edits it. */
  const dialog = useDialog<BusinessProfile | undefined>();

  const { data } = useQuery({
    queryKey: keys.businessProfiles(),
    queryFn: api.businessProfiles,
  });
  const businesses = (data?.businessProfiles ?? []).filter(
    (b) => !b.archivedAt,
  );

  const makeDefault = useOptimisticMutation<
    string,
    unknown,
    { businessProfiles: BusinessProfile[] }
  >({
    queryKey: () => keys.businessProfiles(),
    /* Named in the notice, which outlives Settings: it decides who the next
       invoice is from. */
    mutationFn: (id) =>
      api.updateBusinessProfile(id, { isDefault: true }).catch((e: Error) => {
        const name =
          businesses.find((b) => b.id === id)?.name ?? 'that business';
        throw new Error(`Couldn’t make ${name} the default. ${e.message}`);
      }),
    predict: (current, id) =>
      current && {
        ...current,
        businessProfiles: current.businessProfiles.map((b) => ({
          ...b,
          isDefault: b.id === id,
        })),
      },
  });

  return (
    <Section title="Businesses">
      <ProfileRows
        profiles={businesses}
        detail={(b) => b.email ?? 'No email yet'}
        empty="No business yet. New invoice asks for one."
        onMakeDefault={makeDefault.mutate}
        onEdit={dialog.show}
      />

      <div>
        <Button
          type="button"
          variant="default"
          onClick={() => dialog.show(undefined)}
        >
          Add a business
        </Button>
      </div>

      <BusinessDialog
        open={dialog.open}
        onOpenChange={dialog.onOpenChange}
        existing={dialog.subject}
      />
    </Section>
  );
}
