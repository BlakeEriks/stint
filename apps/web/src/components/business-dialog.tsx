'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Settings } from '@/lib/client/api';
import { ADDRESS_PLACEHOLDER, Field, textareaClass } from './field';
import { SettingsDialog } from './settings-dialog';
import { EMAIL } from '@/lib/client/use-missing';

/**
 * Whether the invoice has no sender yet. The server refuses to generate one
 * without a business name and email; New invoice asks before that.
 */
export const missingBusiness = (s: Settings | undefined) =>
  s !== undefined && (!s.businessName?.trim() || !s.businessEmail?.trim());

/**
 * Who the invoice is from, asked on New invoice rather than sending the
 * user to Settings.
 */
function BusinessDialog({
  onOpenChange,
  settings,
}: {
  onOpenChange: (open: boolean) => void;
  settings: Settings;
}) {
  const [name, setName] = useState(settings.businessName ?? '');
  const [email, setEmail] = useState(settings.businessEmail ?? '');
  const [address, setAddress] = useState(settings.businessAddress ?? '');

  return (
    <SettingsDialog
      onOpenChange={onOpenChange}
      title="Who is this invoice from?"
      description="Your name and email go at the top of every invoice. Saved to Settings, so you're asked once."
      missing={{
        'biz-dialog-name':
          name.trim() === '' ? 'Enter your business name.' : undefined,
        'biz-dialog-email':
          email.trim() === ''
            ? 'Enter your email.'
            : EMAIL.test(email.trim())
              ? undefined
              : 'Enter an email like you@example.com.',
      }}
      patch={() => ({
        businessName: name.trim(),
        businessEmail: email.trim(),
        businessAddress: address.trim() || null,
      })}
    >
      {(pending, error) => (
        <>
          <Field
            label="Business name"
            htmlFor="biz-dialog-name"
            required
            error={error('biz-dialog-name')}
          >
            <Input
              id="biz-dialog-name"
              autoFocus
              placeholder="Sam Rivera Consulting"
              value={name}
              readOnly={pending}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Email"
            htmlFor="biz-dialog-email"
            required
            error={error('biz-dialog-email')}
          >
            <Input
              id="biz-dialog-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              readOnly={pending}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Address" htmlFor="biz-dialog-address">
            <textarea
              id="biz-dialog-address"
              rows={3}
              placeholder={ADDRESS_PLACEHOLDER}
              value={address}
              readOnly={pending}
              onChange={(e) => setAddress(e.target.value)}
              className={textareaClass}
            />
          </Field>
        </>
      )}
    </SettingsDialog>
  );
}

/**
 * Why Generate is disabled, and the way to fix it without leaving the
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
