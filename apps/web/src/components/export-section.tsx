'use client';

import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDownload } from '@/lib/client/use-download';
import { Section } from './field';

export function ExportSection() {
  const entries = useDownload('entries');
  const invoices = useDownload('invoices');

  return (
    <Section
      title="Export"
      description="Your entries and invoices as CSV files, for your accountant, a spreadsheet or another tool."
    >
      <div className="flex flex-wrap gap-2">
        <ExportButton label="Download entries" {...entries} />
        <ExportButton label="Download invoices" {...invoices} />
      </div>
      {entries.failed || invoices.failed ? (
        <p role="alert" className="type-support text-danger">
          The download didn’t complete. Try again.
        </p>
      ) : null}
    </Section>
  );
}

function ExportButton({
  label,
  pending,
  download,
}: {
  label: string;
  pending: boolean;
  download: () => Promise<void>;
}) {
  return (
    <Button type="button" disabled={pending} onClick={download}>
      {pending ? (
        <Loader2 aria-hidden className="animate-spin" />
      ) : (
        <Download aria-hidden strokeWidth={1.75} />
      )}
      {pending ? 'Preparing' : label}
    </Button>
  );
}
