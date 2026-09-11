'use client';
import { use } from 'react';
import { ClientDetail } from '@/components/client-detail';
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ClientDetail id={id} />;
}
