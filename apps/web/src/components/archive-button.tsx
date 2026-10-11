'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** An edit dialog's Archive, or Restore once archived, in the same place.
    Each press is the dialog's to predict and close. */
export function ArchiveButton({
  archived,
  onArchive,
  onRestore,
  className,
}: {
  archived: boolean;
  onArchive: () => void;
  onRestore: () => void;
  className?: string;
}) {
  const Icon = archived ? ArchiveRestore : Archive;
  return (
    <Button
      type="button"
      variant="ghost"
      className={className}
      onClick={archived ? onRestore : onArchive}
    >
      <Icon aria-hidden strokeWidth={1.75} />
      {archived ? 'Restore' : 'Archive'}
    </Button>
  );
}
