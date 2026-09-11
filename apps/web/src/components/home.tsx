'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { useTimer } from '@/lib/client/use-timer';
import { TimerBar } from './timer-bar';
import { EntryList } from './entry-list';

/**
 * Timer hero, today's entries beneath. The view seen 50× a day, so it earns
 * the least friction and the least chrome.
 */
export function Home() {
  const timer = useTimer();
  const { data } = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const projects = data?.projects ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <TimerBar projects={projects} />
      <EntryList projects={projects} todaySeconds={timer.todaySeconds} />
    </main>
  );
}
