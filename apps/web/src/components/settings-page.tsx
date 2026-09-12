'use client';

import { SettingsForm } from './settings-form';
import { PaymentProfiles } from './payment-profiles';

/**
 * Payment profiles sit beside the settings form rather than inside it: they
 * have their own dialogs and their own saves, and a nested <form> is invalid.
 */
export function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-6 type-title text-strong">Settings</h1>
      <div className="flex flex-col gap-4">
        <SettingsForm />
        <PaymentProfiles />
      </div>
    </main>
  );
}
