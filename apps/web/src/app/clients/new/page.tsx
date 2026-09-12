import Link from 'next/link';
import { ClientForm } from '@/components/client-form';
import { Page as Shell } from '@/components/page';

export default function Page() {
  return (
    <Shell>
      <Link href="/clients" className="type-label text-subtle hover:text-muted">
        ← Clients
      </Link>
      <h1 className="mt-4 mb-6 type-title text-strong">Add client</h1>
      <ClientForm />
    </Shell>
  );
}
