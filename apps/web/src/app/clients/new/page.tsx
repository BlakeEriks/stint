import Link from 'next/link';
import { ClientForm } from '@/components/client-form';

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/clients"
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle hover:text-muted"
      >
        ← Clients
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-semibold tracking-tight text-strong">
        Add client
      </h1>
      <ClientForm />
    </main>
  );
}
