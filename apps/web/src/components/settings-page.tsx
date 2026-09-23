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
      <div className="flex flex-col gap-4">
        <SettingsForm />
        <PaymentProfiles />
        <Section
          title="Import"
          description="Bring your history in from a Toggl or Harvest export."
        >
          <div>
            <Button asChild>
              <Link href="/import">Import a file</Link>
            </Button>
          </div>
        </Section>
      </div>
    </Page>
  );
}
