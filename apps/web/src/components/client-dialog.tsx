'use client';

import { Archive } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Client } from '@/lib/client/api';
import { useArchiveClient } from '@/lib/client/use-archive-client';
import { ClientForm } from './client-form';

/**
 * Edits a client where the contractor already is, as `ProjectDialog` does a
 * project, so editing reads the same from any screen. The form is the one
 * the page uses, so the field set cannot drift.
 *
 * Archive sits here rather than on the list: it is rare. Archive, never
 * delete: invoices reference the client.
 */
export function ClientDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
}) {
  const archive = useArchiveClient();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>
            Its rate is what its projects bill at unless they set their own.
          </DialogDescription>
        </DialogHeader>

        {/* Keyed by client so reopening on another one starts from its
            values, not the last one's. */}
        <ClientForm
          key={client.id}
          existing={client}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          footer={
            client.archivedAt ? null : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  archive.mutate(client.id);
                  onOpenChange(false);
                }}
              >
                <Archive aria-hidden strokeWidth={1.75} />
                Archive
              </Button>
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
