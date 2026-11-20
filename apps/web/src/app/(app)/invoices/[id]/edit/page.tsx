import { Suspense } from 'react';
import Loading from '@/app/(app)/loading';
import { EditInvoice } from '@/components/invoice-new';

type Params = { params: Promise<{ id: string }> };

// The id is the URL's, so it waits behind Suspense, outside the shared shell.
export default function Page({ params }: Params) {
  return (
    <Suspense fallback={<Loading />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: Params) {
  const { id } = await params;
  return <EditInvoice id={id} />;
}
