'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Client } from '@/lib/client/api';
import {
  useArchiveClient,
  useRestoreClient,
} from '@/lib/client/use-archive-client';
import { ArchiveButton } from './archive-button';
import { ClientForm } from './client-form';

/**
 * Adds or edits a client where the contractor already is, as `ProjectDialog`
 * does a project, so it reads the same from any screen.
 *
 * Archive sits here rather than on the list: it is rare, and Restore takes
 * its place once archived. Archive, never delete: invoices reference the
 * client.
 */
export function ClientDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
}) {
  const archive = useArchiveClient();
  const restore = useRestoreClient();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? 'Edit client' : 'New client'}</DialogTitle>
          <DialogDescription>
            Its rate is what its projects bill at unless they set their own.
          </DialogDescription>
        </DialogHeader>

        {/* Keyed by client so reopening on another one starts from its
            values, not the last one's. */}
        <ClientForm
          key={client?.id ?? 'new'}
          existing={client}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          footer={
            client && (
              <ArchiveButton
                archived={client.archivedAt != null}
                onArchive={() => {
                  archive.mutate(client.id);
                  onOpenChange(false);
                }}
                onRestore={() => {
                  restore.mutate(client);
                  onOpenChange(false);
                }}
              />
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
