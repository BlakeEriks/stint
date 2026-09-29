'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, ApiError, type Client } from '@/lib/client/api';
import { ClientForm } from './client-form';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

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
  const queryClient = useQueryClient();

  const archive = useMutation({
    mutationFn: () => api.archiveClient(client.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.clients() });
      // Archiving withdraws the client's rate from every rollup.
      invalidateEntryData(queryClient);
      onOpenChange(false);
    },
  });

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
                onClick={() => archive.mutate()}
                disabled={archive.isPending}
              >
                <Archive aria-hidden strokeWidth={1.75} />
                Archive
              </Button>
            )
          }
        />

        {archive.error ? (
          <p role="alert" className="type-support text-danger">
            {archive.error instanceof ApiError
              ? archive.error.message
              : 'Could not archive this client.'}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
