import { ClientForm } from '@/components/client-form';
import { DetailPage } from '@/components/page';

export default function Page() {
  return (
    <DetailPage back="/clients" label="Clients">
      <h1 className="mb-6 type-title text-strong">Add client</h1>
      <ClientForm />
    </DetailPage>
  );
}
