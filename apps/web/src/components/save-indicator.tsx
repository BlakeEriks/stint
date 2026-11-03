'use client';

import type { SaveState } from '@/lib/client/use-autosave';

const TONE: Record<Exclude<SaveState, 'idle'>, string> = {
  pending: 'text-muted',
  saved: 'text-success',
  error: 'text-danger',
};

const WORD: Record<Exclude<SaveState, 'idle'>, string> = {
  pending: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};

/**
 * An autosave's answer, beside what it saves: `useAutosave`'s state, worded.
 *
 * Silent at rest: a word that is always there says nothing, and stops being
 * read. "Saved" appears only after a save the user caused, so it answers
 * "did that land?" and nothing else.
 */
export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <span role="status" className={`type-support ${TONE[state]}`}>
      {WORD[state]}
    </span>
  );
}
