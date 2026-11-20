'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Section } from './field';
import { SettingsForm } from './settings-form';
import { PaymentProfiles } from './payment-profiles';
import { BusinessProfiles } from './business-profiles';
import { AccountSection } from './account-section';
import { PlanSection } from './plan-section';
import { ExportSection } from './export-section';
import { ConnectedApps } from './connected-apps';
import { useQuery } from '@tanstack/react-query';
import { api, type Settings } from '@/lib/client/api';
import { keys } from '@stint/client';
import { Listing, Page } from './page';

/**
 * Businesses and payment profiles sit beside the settings form rather than inside it: they
 * have their own dialogs and their own saves, and a nested <form> is invalid.
 */
export function SettingsPage() {
  /* The page paints once, with its sections' data. Billing and connected
     apps only decide whether their sections show, so their failure leaves
     the rest of the page working; the account's counts load only when its
     dialog opens. */
  const settings = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });
  const profiles = useQuery({
    queryKey: keys.paymentProfiles(),
    queryFn: api.paymentProfiles,
  });
  const businesses = useQuery({
    queryKey: keys.businessProfiles(),
    queryFn: api.businessProfiles,
  });
  const billing = useQuery({ queryKey: keys.billing(), queryFn: api.billing });
  const apps = useQuery({
    queryKey: keys.connectedApps(),
    queryFn: api.connectedApps,
  });

  return (
    <Page title="Settings">
      <Listing query={[settings, profiles, businesses]} also={[billing, apps]}>
        {([loaded]) => <Sections loaded={loaded} />}
      </Listing>
    </Page>
  );
}

function Sections({ loaded }: { loaded: Settings }) {
  /* The title bar's own rule sits above the first section, so its border
     would double it. */
  return (
    <div className="*:first:border-t-0">
      <SettingsForm loaded={loaded} />
      <BusinessProfiles />
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
      <ConnectedApps />
      <PlanSection />
      <AccountSection />
    </div>
  );
}
