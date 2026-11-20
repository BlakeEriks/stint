import { Suspense } from 'react';
import Loading from '@/app/(app)/loading';
import { InvoiceDetail } from '@/components/invoice-detail';

type Params = { params: Promise<{ id: string }> };

// The id is the URL's, so it waits behind Suspense, outside the shared shell.
export default function Page({ params }: Params) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Params) {
  const { id } = await params;
  return <InvoiceDetail id={id} />;
}
