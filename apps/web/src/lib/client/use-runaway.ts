'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type TimeEntry } from './api';
import { useTimer } from './use-timer';
import { invalidateEntryData } from './query-keys';

/**
 * The runaway timer choice: keep, adjust, or discard.
 *
 * Lives here rather than in a component because **the notice and the editor
 * it opens are now in different places.** The choice is offered by the
 * inbox, in the dock; Adjust stops the timer and hands the stopped entry to
 * the `EntryDialog` the timer bar owns. Threading that through the layout
 * would mean props crossing two components that have no other reason to know
 * about each other.
 *
 * `principles.md` promises the app SURFACES a runaway timer and never edits
 * the entry itself. This is where the user does the editing, which is what
 * makes the promise honest rather than a refusal to help.
 */

/* Module-level, because the inbox and the timer bar are siblings in the
   frame and React has no cheaper way for one to hand an entry to the other.
   A context provider would be the textbook answer and would wrap the whole
   app to carry one occasional value. */
let adjustingEntry: TimeEntry | undefined;
const listeners = new Set<() => void>();

function setAdjusting(entry: TimeEntry | undefined) {
  adjustingEntry = entry;
  for (const notify of listeners) notify();
}

/** The entry Adjust just stopped, for whoever renders the editor. */
export function useAdjustingEntry(): [
  TimeEntry | undefined,
  (entry: TimeEntry | undefined) => void,
] {
  const [entry, setEntry] = useState(adjustingEntry);

  useEffect(() => {
    const notify = () => setEntry(adjustingEntry);
    listeners.add(notify);
    notify();
    return () => {
      listeners.delete(notify);
    };
  }, []);

  return [entry, setAdjusting];
}

/**
 * Whether a runaway timer wants a decision, and the three ways to give one.
 *
 * `dismissed` resets when the overrun ends, so Keep silences THIS overrun
 * rather than the feature.
 */
export function useRunaway(onRetired?: () => void) {
  const timer = useTimer();
  const exceeded = timer.exceedsThreshold;
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  // A fresh overrun deserves the notice again, even after an earlier dismiss.
  useEffect(() => {
    if (!exceeded) setDismissed(false);
  }, [exceeded]);

  const invalidateAll = () => invalidateEntryData(queryClient);

  /* Stop first, then edit. A running entry has no end yet, so there is
     nothing to adjust until it is stopped — and stopping is what the user
     meant by "I left it going". */
  /* Both remove the row by CHANGING SERVER STATE — the timer stops, so
     `exceeded` goes false on the refetch and the row unmounts in the same
     commit. `onRetired` fires first so a caller animating that row can claim
     it while it is still rendered.

     On success rather than on click: discard is two requests, and collapsing a
     row whose deletion might still fail would mean bringing it back. */
  const adjust = useMutation({
    mutationFn: () => api.stopTimer(),
    onSuccess: (entry) => {
      onRetired?.();
      invalidateAll();
      setAdjusting(entry);
    },
  });

  const discard = useMutation({
    mutationFn: async () => {
      const entry = await api.stopTimer();
      await api.deleteEntry(entry.id);
    },
    onSuccess: () => {
      onRetired?.();
      invalidateAll();
    },
  });

  return {
    /* Keep touches nothing: a long timer is often correct, and stopping it
       would be the app editing billable work. */
    showing: exceeded && !dismissed,
    hours: Math.floor(timer.seconds / 3600),
    busy: adjust.isPending || discard.isPending,
    keep: () => setDismissed(true),
    adjust: () => adjust.mutate(),
    discard: () => discard.mutate(),
  };
}
