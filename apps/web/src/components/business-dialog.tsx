'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Settings } from '@/lib/client/api';
import { SettingsDialog } from './settings-dialog';
import { emailError, type Identity, IdentityFields } from './settings-fields';

/**
 * Whether the invoice has no sender yet. The server refuses to generate one
 * without a business name and email; New invoice asks before that.
 */
export const missingBusiness = (s: Settings | undefined) =>
  s !== undefined && (!s.businessName?.trim() || !s.businessEmail?.trim());

/**
 * Who the invoice is from, asked or corrected on New invoice rather than
 * sending the user to Settings.
 */
export function BusinessDialog({
  onOpenChange,
  settings,
}: {
  onOpenChange: (open: boolean) => void;
  settings: Settings;
}) {
  const [business, setBusiness] = useState<Identity>({
    name: settings.businessName ?? '',
    email: settings.businessEmail ?? '',
    address: settings.businessAddress ?? '',
  });

  return (
    <SettingsDialog
      onOpenChange={onOpenChange}
      title="Who’s this invoice from?"
      description="Your name and email go at the top of every invoice. Saved to Settings, for this invoice and every one after it."
      missing={{
        'biz-dialog-name':
          business.name.trim() === '' ? 'Enter your business name.' : undefined,
        'biz-dialog-email': emailError(business.email),
      }}
      patch={() => ({
        businessName: business.name.trim(),
        businessEmail: business.email.trim(),
        businessAddress: business.address.trim() || null,
      })}
    >
      {(pending, error) => (
        <IdentityFields
          id="biz-dialog"
          value={business}
          onChange={(key, text) => setBusiness((b) => ({ ...b, [key]: text }))}
          error={(key) => error(`biz-dialog-${key}`)}
          required
          readOnly={pending}
          autoFocus
        />
      )}
    </SettingsDialog>
  );
}

/**
 * Why Save draft is disabled, and the way to fix it without leaving the
 * invoice. The edge is the warning hue the Inbox ranks a fault with.
 */
export function SenderNotice({ settings }: { settings: Settings | undefined }) {
  const [asking, setAsking] = useState(false);
  if (!settings || !missingBusiness(settings)) return null;
  return (
    <div>
      <div
        role="status"
        className="flex items-center justify-between gap-3 rounded-lg border border-edge-default border-l-2 border-l-warning px-3 py-2.5"
      >
        <div className="min-w-0">
          <p className="type-control text-strong">
            Your business details are missing
          </p>
          <p className="type-support text-muted">
            Name and email are needed to generate.
          </p>
        </div>
        <Button type="button" onClick={() => setAsking(true)}>
          Add details
        </Button>
      </div>
      {asking ? (
        <BusinessDialog onOpenChange={setAsking} settings={settings} />
      ) : null}
    </div>
  );
}
