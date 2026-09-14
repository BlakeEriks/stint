'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { useTimer } from '@/lib/client/use-timer';
import { EntryList } from './entry-list';
import { HomeCards } from './home-cards';
import { Page } from './page';
import { keys } from '@/lib/client/query-keys';

/** The cards, then today's entries. */
export function Home() {
  const timer = useTimer();
  const { data } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });
  const projects = data?.projects ?? [];

  return (
    <Page wide>
      <HomeCards />
      <EntryList projects={projects} todaySeconds={timer.todaySeconds} />
    </Page>
  );
}
