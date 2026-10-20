'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Section } from './field';
import { SettingsForm } from './settings-form';
import { PaymentProfiles } from './payment-profiles';
import { AccountSection } from './account-section';
import { PlanSection } from './plan-section';
import { ExportSection } from './export-section';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';
import { Listing, Page } from './page';

/**
 * Payment profiles sit beside the settings form rather than inside it: they
 * have their own dialogs and their own saves, and a nested <form> is invalid.
 */
export function SettingsPage() {
  /* Every section's data, so the page paints once rather than section by
     section. The account's counts load only when its dialog opens. */
  const settings = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });
  const profiles = useQuery({
    queryKey: keys.paymentProfiles(),
    queryFn: api.paymentProfiles,
  });
  const billing = useQuery({ queryKey: keys.billing(), queryFn: api.billing });

  return (
    <Page>
      <h1 className="mb-6 type-title text-strong">Settings</h1>
      <Listing query={[settings, profiles, billing]}>
        {() => <Sections />}
      </Listing>
    </Page>
  );
}

function Sections() {
  return (
    <>
      <SettingsForm />
      <PaymentProfiles />
      <Section
        title="Import"
        description="Bring your history in from a Toggl export."
      >
        <div>
          <Button asChild>
            <Link href="/settings/import">Import a file</Link>
          </Button>
        </div>
      </Section>
      <ExportSection />
      <PlanSection />
      <AccountSection />
    </>
  );
}
