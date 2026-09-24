'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Section } from './field';
import { SettingsForm } from './settings-form';
import { PaymentProfiles } from './payment-profiles';
import { Page } from './page';

/**
 * Payment profiles sit beside the settings form rather than inside it: they
 * have their own dialogs and their own saves, and a nested <form> is invalid.
 */
export function SettingsPage() {
  return (
    <Page>
      <h1 className="mb-6 type-title text-strong">Settings</h1>
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
    </Page>
  );
}
