'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorPicker } from './color-picker';
import { api, ApiError, type Client, type ClientInput } from '@/lib/client/api';

/**
 * Create and edit are the same form — the only difference is which request
 * it issues, so they cannot drift in validation or field set.
 *
 * Rate and tax are optional: a client with no rate falls back to the user
 * default, and a US contractor invoicing services usually owes no tax at all.
 */
export function ClientForm({ existing }: { existing?: Client }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [hourlyRate, setHourlyRate] = useState(
    existing?.hourlyRate != null ? String(existing.hourlyRate) : '',
  );
  const [taxRate, setTaxRate] = useState(
    existing?.taxRate != null ? String(existing.taxRate) : '',
  );
  const [color, setColor] = useState<string | null>(existing?.color ?? null);

  const save = useMutation({
    mutationFn: (body: ClientInput) =>
      existing ? api.updateClient(existing.id, body) : api.createClient(body),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      router.push(`/clients/${saved.id}`);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: name.trim(),
      // Empty is "unset", not empty string — the column is nullable and the
      // schema rejects a blank email.
      email: email.trim() || null,
      address: address.trim() || null,
      hourlyRate: hourlyRate.trim() === '' ? null : Number(hourlyRate),
      taxRate: taxRate.trim() === '' ? null : Number(taxRate),
      color,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label="Name" required>
        <Input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Corp"
        />
      </Field>

      <Field label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="billing@acme.com"
        />
      </Field>

      <Field label="Address" hint="Appears on the invoice.">
        <textarea
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={'123 Main St\nAustin, TX 78701'}
          className="w-full rounded-md border border-edge-default bg-transparent px-3 py-2
                     text-[14px] text-strong placeholder:text-subtle outline-none
                     focus-visible:border-edge-focus focus-visible:ring-[3px]
                     focus-visible:ring-edge-focus"
        />
      </Field>

      <div className="flex flex-wrap gap-4">
        <Field
          label="Hourly rate"
          hint="Falls back to your default."
          className="flex-1 basis-40"
        >
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="150.00"
          />
        </Field>

        <Field
          label="Tax rate %"
          hint="Usually none for US services."
          className="flex-1 basis-40"
        >
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <ColorPicker value={color} onChange={setColor} />

      {save.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {save.error instanceof ApiError
            ? save.error.message
            : 'Could not save this client.'}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending || name.trim() === ''}>
          {save.isPending
            ? 'Saving…'
            : existing
              ? 'Save changes'
              : 'Add client'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
        {label}
        {required ? <span aria-hidden> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-[12px] text-subtle">{hint}</p> : null}
    </div>
  );
}
