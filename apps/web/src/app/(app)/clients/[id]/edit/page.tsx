import { EditClient } from '@/components/edit-client';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditClient id={id} />;
}
